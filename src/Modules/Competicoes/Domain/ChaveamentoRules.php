<?php

declare (strict_types=1);

namespace App\Modules\Competicoes\Domain;

final class ChaveamentoRules
{
    /**
     * Chaveamento mata-mata: metadados compactos em nome_jogo (VARCHAR 45).
     * Formato: MM:{largura_fase}:{slot}:{N|B}
     * - largura_fase: 8,4,2 (oitavas→8 … final→2). O campeão é o vencedor da
     *   final e não é modelado como uma partida solo adicional.
     * - slot: 0-based dentro da fase
     * - N = confronto normal; B = bye (uma equipe, jogo já concluído)
     */
    public static function tag(int $larguraFase, int $slot, string $kind): string
    {
        return 'MM:' . $larguraFase . ':' . $slot . ':' . $kind;
    }
    /** @return array{largura:int, slot:int, kind:string, posicao?:int}|null */
    public static function parse(?string $nomeJogo): ?array
    {
        if (!\is_string($nomeJogo)) {
            return \null;
        }
        if (\preg_match('/^MM:(\d+):(\d+):([NB])$/', $nomeJogo, $m)) {
            return ['largura' => (int) $m[1], 'slot' => (int) $m[2], 'kind' => $m[3]];
        }
        if (\preg_match('/^POS:(\d+):(\d+):([NB])$/', $nomeJogo, $m)) {
            return ['largura' => 0, 'slot' => (int) $m[2], 'kind' => $m[3], 'posicao' => (int) $m[1]];
        }
        return \null;
    }
    public static function proximaLargura(int $largura): int
    {
        return (int) \max(1, $largura / 2);
    }
    public static function slotPai(int $slot): int
    {
        return (int) \floor($slot / 2);
    }
    public static function slotIrmao(int $slot): int
    {
        return $slot % 2 === 0 ? $slot + 1 : $slot - 1;
    }
    public static function slotPertenceAoRamo(int $larguraRamo, int $slotRamo, int $larguraDescendente, int $slotDescendente): bool
    {
        if ($larguraRamo <= 0 || $larguraDescendente <= $larguraRamo || $larguraDescendente % $larguraRamo !== 0) {
            return false;
        }
        return intdiv($slotDescendente, intdiv($larguraDescendente, $larguraRamo)) === $slotRamo;
    }
    public static function proximoPow2(int $n): int
    {
        if ($n <= 1) {
            return 2;
        }
        $p = 1;
        while ($p < $n) {
            $p *= 2;
        }
        return $p;
    }

    /**
     * Prepara os participantes nas folhas da árvore de forma que os byes
     * avancem para uma partida na fase seguinte. Em cada nível, uma equipe
     * que avançou por bye só pode ficar contra um jogo ocupado; um novo bye
     * só pode vir do vencedor de um jogo, nunca da equipe que acabou de ter
     * bye. A disposição entre as árvores válidas e as equipes é sorteada.
     *
     * @param list<int> $teamIds
     * @return list<int|null>
     */
    public static function distribuirEquipesNaChaveInicial(array $teamIds): array
    {
        $teamCount = count($teamIds);
        if ($teamCount < 2) {
            throw new \InvalidArgumentException('São necessárias ao menos duas equipes para montar a chave.');
        }

        $width = self::proximoPow2($teamCount);
        $capacity = intdiv($width, 2);
        $rounds = [];
        $remaining = $teamCount;
        while (true) {
            $matches = intdiv($remaining, 2);
            $byes = $remaining % 2;
            $empty = $capacity - $matches - $byes;
            $rounds[] = ['N' => $matches, 'B' => $byes, 'E' => $empty];
            if ($capacity === 1) {
                break;
            }
            $remaining = $matches + $byes;
            $capacity = intdiv($capacity, 2);
        }

        // Constrói a árvore de baixo para cima respeitando a quantidade exata
        // de confrontos/byes/vagas vazias de cada rodada.
        $gameTypes = ['N'];
        for ($round = count($rounds) - 2; $round >= 0; $round--) {
            $gameTypes = self::expandirTipos($gameTypes, $rounds[$round]);
        }
        shuffle($teamIds);

        $slots = [];
        $teamIndex = 0;
        foreach ($gameTypes as $gameType) {
            if ($gameType === 'N') {
                $slots[] = $teamIds[$teamIndex++];
                $slots[] = $teamIds[$teamIndex++];
            } elseif ($gameType === 'B') {
                if (random_int(0, 1) === 0) {
                    $slots[] = $teamIds[$teamIndex++];
                    $slots[] = null;
                } else {
                    $slots[] = null;
                    $slots[] = $teamIds[$teamIndex++];
                }
            } else {
                $slots[] = null;
                $slots[] = null;
            }
        }

        return $slots;
    }

    /** @param list<string> $parents @param array{N:int,B:int,E:int} $target @return list<string> */
    private static function expandirTipos(array $parents, array $target): array
    {
        $memo = [];
        $solve = static function (int $index, array $left) use (&$solve, &$memo, $parents): ?array {
            $key = $index . ':' . $left['N'] . ':' . $left['B'] . ':' . $left['E'];
            if (array_key_exists($key, $memo)) {
                return $memo[$key] === false ? null : $memo[$key];
            }
            if ($index === count($parents)) {
                $done = $left === ['N' => 0, 'B' => 0, 'E' => 0];
                $memo[$key] = $done ? [] : false;
                return $done ? [] : null;
            }

            $options = match ($parents[$index]) {
                // Participante(s) no próximo nível: um bye antigo deve jogar.
                'N' => [['N', 'N'], ['N', 'B'], ['B', 'N'], ['B', 'B']],
                // O novo bye só pode vir de vencedor de confronto.
                'B' => [['N', 'E'], ['E', 'N']],
                default => [['E', 'E']],
            };
            shuffle($options);
            foreach ($options as $option) {
                $next = $left;
                foreach ($option as $type) {
                    $next[$type]--;
                }
                if (min($next) < 0) {
                    continue;
                }
                $suffix = $solve($index + 1, $next);
                if ($suffix !== null) {
                    $result = array_merge($option, $suffix);
                    $memo[$key] = $result;
                    return $result;
                }
            }
            $memo[$key] = false;
            return null;
        };

        $result = $solve(0, $target);
        if ($result === null) {
            throw new \LogicException('Não foi possível planejar as rodadas sem byes consecutivos.');
        }
        return $result;
    }

    public static function nomeFasePt(int $largura): string
    {
        return match ($largura) {
            16 => 'Oitavas de final',
            8 => 'Quartas de final',
            4 => 'Semifinal',
            2 => 'Final',
            1 => 'Campeão',
            default => 'Fase ' . $largura,
        };
    }
    public static function jogoEstaEncerrado(string $status): bool
    {
        return $status === 'Concluido' || $status === 'Finalizado';
    }
    /**
     * Vencedor por maior resultado_partida; empate → menor id_equipe.
     *
     * @param list<array{equipes_id_equipe:int, resultado_partida:int}> $partidas
     */
    public static function vencedorDePartidas(array $partidas): ?int
    {
        if ($partidas === []) {
            return \null;
        }
        if (\count($partidas) === 1) {
            return (int) $partidas[0]['equipes_id_equipe'];
        }
        \usort($partidas, static function (array $x, array $y): int {
            if ((int) $x['resultado_partida'] !== (int) $y['resultado_partida']) {
                return (int) $y['resultado_partida'] <=> (int) $x['resultado_partida'];
            }
            return (int) $x['equipes_id_equipe'] <=> (int) $y['equipes_id_equipe'];
        });
        return (int) $partidas[0]['equipes_id_equipe'];
    }
    /* ==========================================================================
       DISPUTAS DE POSIÇÃO (3º, 4º lugares)
       ========================================================================== */
    public static function nomeFasePosicao(int $posicao): string
    {
        return match ($posicao) {
            3 => 'Disputa de 3º lugar',
            5 => 'Disputa de 5º lugar',
            default => 'Disputa de ' . $posicao . 'º lugar',
        };
    }
    /** @param list<array{equipes_id_equipe:int, resultado_partida:int}> $partidas */
    public static function perdedorDePartidas(array $partidas): ?int
    {
        if (\count($partidas) < 2) {
            return \null;
        }
        \usort($partidas, static function (array $x, array $y): int {
            if ((int) $x['resultado_partida'] !== (int) $y['resultado_partida']) {
                return (int) $y['resultado_partida'] <=> (int) $x['resultado_partida'];
            }
            return (int) $x['equipes_id_equipe'] <=> (int) $y['equipes_id_equipe'];
        });
        return (int) $partidas[1]['equipes_id_equipe'];
    }

    /**
     * Deriva o terceiro colocado sem criar uma partida adicional: é o
     * perdedor da semifinal vencida pelo campeão.
     *
     * Semifinais por bye não produzem perdedor e, portanto, não geram uma
     * classificação automática de terceiro lugar.
     *
     * @param list<array{kind:string,partidas:list<array{equipes_id_equipe:int,resultado_partida:int}>}> $semifinais
     */
    public static function terceiroLugarDoCampeao(?int $campeao, array $semifinais): ?int
    {
        if ($campeao === null || $campeao <= 0) {
            return null;
        }

        $terceiro = null;
        foreach ($semifinais as $semifinal) {
            if ($semifinal['kind'] === 'B') {
                continue;
            }
            $partidas = $semifinal['partidas'];
            if (count($partidas) < 2) {
                continue;
            }
            $vencedor = self::vencedorDePartidas($partidas);
            if ($vencedor !== $campeao) {
                continue;
            }
            $perdedor = self::perdedorDePartidas($partidas);
            if ($perdedor === null || $perdedor === $campeao) {
                continue;
            }
            if ($terceiro !== null && $terceiro !== $perdedor) {
                return null;
            }
            $terceiro = $perdedor;
        }

        return $terceiro;
    }
}
