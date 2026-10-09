<?php

declare (strict_types=1);

namespace App\Modules\Competicoes\Infrastructure;

use App\Modules\Competicoes\Domain\ChaveamentoRules;

final class MysqliChaveamentoRepository
{
    public static function resolverIdLocal(\mysqli $conn): int
    {
        $q = $conn->query("SELECT id_local FROM locais WHERE status_local = '1' ORDER BY id_local ASC LIMIT 1");
        if ($q && $r = $q->fetch_assoc()) {
            return (int) $r['id_local'];
        }
        $q2 = $conn->query('SELECT id_local FROM locais ORDER BY id_local ASC LIMIT 1');
        if ($q2 && $r2 = $q2->fetch_assoc()) {
            return (int) $r2['id_local'];
        }
        throw new \RuntimeException("Não há locais cadastrados na tabela 'locais'.");
    }
    /**
     * Equipes ativas com pelo menos um competidor ativo vinculado (elenco mínimo).
     *
     * @return list<array{id_equipe:int}>
     */
    public static function buscarEquipesValidadas(\mysqli $conn, int $idModalidade): array
    {
        $sql = 'SELECT DISTINCT e.id_equipe
            FROM equipes e
            INNER JOIN equipes_has_usuarios ehu ON ehu.equipes_id_equipe = e.id_equipe
            INNER JOIN usuarios u ON u.id_usuario = ehu.usuarios_id_usuario
            WHERE e.modalidades_id_modalidade = ?
              AND e.status_equipe = \'1\'
              AND u.status_usuario = \'1\'';
        $st = $conn->prepare($sql);
        if (!$st) {
            throw new \RuntimeException($conn->error);
        }
        $st->bind_param('i', $idModalidade);
        $st->execute();
        $rows = $st->get_result()->fetch_all(\MYSQLI_ASSOC);
        $st->close();
        return \array_map(static fn (array $r): array => ['id_equipe' => (int) $r['id_equipe']], $rows);
    }
    public static function faseInicialExiste(\mysqli $conn, int $idModalidade): bool
    {
        $st = $conn->prepare("SELECT 1 FROM jogos WHERE modalidades_id_modalidade = ? AND nome_jogo LIKE 'MM:%' LIMIT 1");
        $st->bind_param('i', $idModalidade);
        $st->execute();
        $ok = $st->get_result()->num_rows > 0;
        $st->close();
        return $ok;
    }
    /**
     * @param list<array{id_equipe:int}> $equipes
     */
    public static function criarChaveamentoInicial(\mysqli $conn, int $idModalidade, array $equipes): array
    {
        if (\App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository::faseInicialExiste($conn, $idModalidade)) {
            throw new \RuntimeException('O chaveamento desta modalidade já foi gerado (fase inicial MM).');
        }
        $n = \count($equipes);
        if ($n < 2) {
            throw new \RuntimeException('Equipes insuficientes (mínimo 2 com elenco validado).');
        }
        $w = \App\Modules\Competicoes\Domain\ChaveamentoRules::proximoPow2($n);
        $slots = \App\Modules\Competicoes\Domain\ChaveamentoRules::distribuirEquipesNaChaveInicial(\array_map(
            static fn (array $team): int => (int) $team['id_equipe'],
            $equipes,
        ));
        $jogosCriados = 0;
        $byeJogos = [];
        $meio = (int) ($w / 2);
        for ($s = 0; $s < $meio; $s++) {
            $a = $slots[2 * $s];
            $b = $slots[2 * $s + 1];
            if ($a === \null && $b === \null) {
                continue;
            }
            if ($a !== \null && $b !== \null) {
                \App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository::inserirJogoDupla($conn, $idModalidade, 0, $w, $s, 'N', $a, $b, 'Agendado');
                $jogosCriados++;
                continue;
            }
            $bye = $a ?? $b;
            $idBye = \App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository::inserirJogoBye($conn, $idModalidade, 0, $w, $s, (int) $bye);
            $byeJogos[] = $idBye;
            $jogosCriados++;
        }
        return ['jogos_criados' => $jogosCriados, 'bye_jogos' => $byeJogos];
    }
    public static function inserirJogoDupla(\mysqli $conn, int $idModalidade, int $idLocal, int $largura, int $slot, string $kind, int $idA, int $idB, string $statusJogo): int
    {
        $nome = \App\Modules\Competicoes\Domain\ChaveamentoRules::tag($largura, $slot, $kind);
        $st = $conn->prepare("INSERT INTO jogos (nome_jogo, data_jogo, inicio_jogo, termino_jogo, status_jogo, modalidades_id_modalidade, locais_id_local)\r\n         VALUES (?, NULL, NULL, NULL, ?, ?, NULL)");
        $st->bind_param('ssi', $nome, $statusJogo, $idModalidade);
        $st->execute();
        $idJogo = (int) $conn->insert_id;
        $st->close();
        self::aplicarReservaAgenda($conn, $idModalidade, $nome, $idJogo);
        $stP = $conn->prepare("INSERT INTO partidas (jogos_id_jogo, equipes_id_equipe, resultado_partida, status_partida) VALUES (?, ?, 0, '1')");
        $stP->bind_param('ii', $idJogo, $idA);
        $stP->execute();
        $stP->bind_param('ii', $idJogo, $idB);
        $stP->execute();
        $stP->close();
        return $idJogo;
    }
    public static function inserirJogoBye(\mysqli $conn, int $idModalidade, int $idLocal, int $largura, int $slot, int $idEquipe): int
    {
        $nome = \App\Modules\Competicoes\Domain\ChaveamentoRules::tag($largura, $slot, 'B');
        $st = $conn->prepare("INSERT INTO jogos (nome_jogo, data_jogo, inicio_jogo, termino_jogo, status_jogo, modalidades_id_modalidade, locais_id_local)\r\n         VALUES (?, NULL, NULL, NULL, 'Concluido', ?, NULL)");
        $st->bind_param('si', $nome, $idModalidade);
        $st->execute();
        $idJogo = (int) $conn->insert_id;
        $st->close();
        self::aplicarReservaAgenda($conn, $idModalidade, $nome, $idJogo);
        $stP = $conn->prepare("INSERT INTO partidas (jogos_id_jogo, equipes_id_equipe, resultado_partida, status_partida) VALUES (?, ?, 1, '1')");
        $stP->bind_param('ii', $idJogo, $idEquipe);
        $stP->execute();
        $stP->close();
        return $idJogo;
    }
    /** @return list<array{equipes_id_equipe:int, resultado_partida:int}> */
    public static function carregarPartidasJogo(\mysqli $conn, int $idJogo): array
    {
        $st = $conn->prepare('SELECT equipes_id_equipe, resultado_partida FROM partidas WHERE jogos_id_jogo = ?');
        $st->bind_param('i', $idJogo);
        $st->execute();
        $rows = $st->get_result()->fetch_all(\MYSQLI_ASSOC);
        $st->close();
        return \array_map(static fn (array $r): array => ['equipes_id_equipe' => (int) $r['equipes_id_equipe'], 'resultado_partida' => (int) $r['resultado_partida']], $rows);
    }
    public static function vencedorDoJogo(\mysqli $conn, int $idJogo, string $statusJogo, string $kind): ?int
    {
        if (!\App\Modules\Competicoes\Domain\ChaveamentoRules::jogoEstaEncerrado($statusJogo)) {
            return \null;
        }
        $ps = \App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository::carregarPartidasJogo($conn, $idJogo);
        if ($kind === 'B') {
            return $ps[0]['equipes_id_equipe'] ?? \null;
        }
        return \App\Modules\Competicoes\Domain\ChaveamentoRules::vencedorDePartidas($ps);
    }
    public static function buscarJogoPorTag(\mysqli $conn, int $idModalidade, string $tag): ?array
    {
        $st = $conn->prepare('SELECT id_jogo, nome_jogo, status_jogo FROM jogos WHERE modalidades_id_modalidade = ? AND nome_jogo = ? LIMIT 1');
        $st->bind_param('is', $idModalidade, $tag);
        $st->execute();
        $row = $st->get_result()->fetch_assoc();
        $st->close();
        return $row ?: \null;
    }
    /**
     * Filhos diretos do jogo-pai (largura_pai, slot_pai) na camada inferior (largura = 2 * pai).
     * Cada filho existente deve estar encerrado; filho inexistente = par vazio na semente.
     */
    public static function filhosResolvidosParaPai(\mysqli $conn, int $idModalidade, int $larguraPai, int $slotPai): bool
    {
        $lChild = $larguraPai * 2;
        if ($lChild < 2) {
            return \true;
        }
        $s0 = 2 * $slotPai;
        $s1 = 2 * $slotPai + 1;
        foreach ([$s0, $s1] as $cs) {
            $j0 = \App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository::buscarJogoPorTag($conn, $idModalidade, \App\Modules\Competicoes\Domain\ChaveamentoRules::tag($lChild, $cs, 'N')) ?? \App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository::buscarJogoPorTag($conn, $idModalidade, \App\Modules\Competicoes\Domain\ChaveamentoRules::tag($lChild, $cs, 'B'));
            if ($j0 === \null) {
                continue;
            }
            if (!\App\Modules\Competicoes\Domain\ChaveamentoRules::jogoEstaEncerrado((string) $j0['status_jogo'])) {
                return \false;
            }
        }
        return \true;
    }
    public static function contarPartidas(\mysqli $conn, int $idJogo): int
    {
        $st = $conn->prepare('SELECT COUNT(*) AS c FROM partidas WHERE jogos_id_jogo = ?');
        $st->bind_param('i', $idJogo);
        $st->execute();
        $c = (int) ($st->get_result()->fetch_assoc()['c'] ?? 0);
        $st->close();
        return $c;
    }
    /**
     * Quando o pai fica com um único competidor e ambos os lados da chave já foram resolvidos (bye implícito).
     */
    public static function tentarAutoconcluirPaiUmClube(\mysqli $conn, int $idModalidade, int $idJogoPai): void
    {
        $st = $conn->prepare('SELECT id_jogo, nome_jogo, status_jogo FROM jogos WHERE id_jogo = ? LIMIT 1');
        $st->bind_param('i', $idJogoPai);
        $st->execute();
        $row = $st->get_result()->fetch_assoc();
        $st->close();
        if (!$row) {
            return;
        }
        if (\App\Modules\Competicoes\Domain\ChaveamentoRules::jogoEstaEncerrado((string) $row['status_jogo'])) {
            return;
        }
        $meta = \App\Modules\Competicoes\Domain\ChaveamentoRules::parse($row['nome_jogo']);
        if ($meta === \null) {
            return;
        }
        if ($meta['largura'] === 2) {
            return;
        }
        if (\App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository::contarPartidas($conn, $idJogoPai) !== 1) {
            return;
        }
        if (!\App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository::filhosResolvidosParaPai($conn, $idModalidade, $meta['largura'], $meta['slot'])) {
            return;
        }
        $stU = $conn->prepare("UPDATE jogos SET status_jogo = 'Concluido' WHERE id_jogo = ?");
        $stU->bind_param('i', $idJogoPai);
        $stU->execute();
        $stU->close();
        \App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository::chaveamentoProcessarAvanco($conn, $idJogoPai);
    }
    public static function garantirPartidaEquipe(\mysqli $conn, int $idJogo, int $idEquipe): void
    {
        $part = \App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository::carregarPartidasJogo($conn, $idJogo);
        $ids = \array_column($part, 'equipes_id_equipe');
        if (\in_array($idEquipe, $ids, \true)) {
            return;
        }
        $stP = $conn->prepare("INSERT INTO partidas (jogos_id_jogo, equipes_id_equipe, resultado_partida, status_partida) VALUES (?, ?, 0, '1')");
        $stP->bind_param('ii', $idJogo, $idEquipe);
        $stP->execute();
        $stP->close();
    }

    /** @param list<int> $keepTeams */
    public static function desvincularHistoricoDasPartidas(\mysqli $conn, int $gameId, array $keepTeams = []): void
    {
        $sql = 'UPDATE artilheiros a
                INNER JOIN partidas p ON p.id_partida = a.partidas_id_partida
                SET a.partidas_id_partida = NULL
                WHERE p.jogos_id_jogo = ?';
        $types = 'i';
        $params = [$gameId];
        if ($keepTeams !== []) {
            $sql .= ' AND p.equipes_id_equipe NOT IN (' . implode(',', array_fill(0, count($keepTeams), '?')) . ')';
            $types .= str_repeat('i', count($keepTeams));
            $params = array_merge($params, $keepTeams);
        }
        $statement = $conn->prepare($sql);
        $statement->bind_param($types, ...$params);
        $statement->execute();
        $statement->close();
    }

    /**
     * Limpa todos os jogos MM nas fases posteriores à fase informada e reprocessa o avanço
     * a partir dos jogos concluídos daquela fase em diante. Usado quando o vencedor de um
     * jogo já concluído é alterado.
     */
    public static function chaveamentoRebuildFromRound(\mysqli $conn, int $idModalidade, int $larguraInicial): void
    {
        $st = $conn->prepare("SELECT id_jogo, nome_jogo, status_jogo FROM jogos WHERE modalidades_id_modalidade = ? AND nome_jogo LIKE 'MM:%' ORDER BY id_jogo ASC");
        $st->bind_param('i', $idModalidade);
        $st->execute();
        $jogos = $st->get_result()->fetch_all(\MYSQLI_ASSOC);
        $st->close();
        foreach ($jogos as $j) {
            $meta = \App\Modules\Competicoes\Domain\ChaveamentoRules::parse($j['nome_jogo']);
            if ($meta === \null) {
                continue;
            }
            if ($meta['largura'] < $larguraInicial) {
                $jogoId = (int) $j['id_jogo'];
                self::desvincularHistoricoDasPartidas($conn, $jogoId);
                $stD = $conn->prepare("DELETE FROM partidas WHERE jogos_id_jogo = ?");
                $stD->bind_param('i', $jogoId);
                $stD->execute();
                $stD->close();
                $stU = $conn->prepare("UPDATE jogos SET status_jogo = 'Agendado' WHERE id_jogo = ?");
                $stU->bind_param('i', $jogoId);
                $stU->execute();
                $stU->close();
            }
        }
        $stPOS = $conn->prepare("SELECT id_jogo FROM jogos WHERE modalidades_id_modalidade = ? AND nome_jogo LIKE 'POS:%'");
        $stPOS->bind_param('i', $idModalidade);
        $stPOS->execute();
        $posGames = $stPOS->get_result()->fetch_all(\MYSQLI_ASSOC);
        $stPOS->close();
        foreach ($posGames as $pg) {
            $posGameId = (int) $pg['id_jogo'];
            self::desvincularHistoricoDasPartidas($conn, $posGameId);
            $stDP = $conn->prepare("DELETE FROM partidas WHERE jogos_id_jogo = ?");
            $stDP->bind_param('i', $posGameId);
            $stDP->execute();
            $stDP->close();
            $stDJ = $conn->prepare("DELETE FROM jogos WHERE id_jogo = ?");
            $stDJ->bind_param('i', $posGameId);
            $stDJ->execute();
            $stDJ->close();
        }
        $jogosPorRodada = [];
        foreach ($jogos as $j) {
            $meta = \App\Modules\Competicoes\Domain\ChaveamentoRules::parse($j['nome_jogo']);
            if ($meta === \null) {
                continue;
            }
            $l = $meta['largura'];
            if ($l >= $larguraInicial) {
                $jogosPorRodada[$l][] = $j;
            }
        }
        \krsort($jogosPorRodada);
        foreach ($jogosPorRodada as $rodada) {
            foreach ($rodada as $j) {
                if (\App\Modules\Competicoes\Domain\ChaveamentoRules::jogoEstaEncerrado((string) $j['status_jogo'])) {
                    \App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository::chaveamentoProcessarAvanco($conn, (int) $j['id_jogo']);
                }
            }
        }
    }
    /**
     * Após um jogo MM ser concluído: tenta formar o jogo da fase seguinte quando o par de chave estiver definido.
     */
    public static function chaveamentoProcessarAvanco(\mysqli $conn, int $idJogo): void
    {
        $st = $conn->prepare('SELECT id_jogo, nome_jogo, status_jogo, modalidades_id_modalidade, data_jogo, locais_id_local FROM jogos WHERE id_jogo = ? LIMIT 1');
        $st->bind_param('i', $idJogo);
        $st->execute();
        $j = $st->get_result()->fetch_assoc();
        $st->close();
        if (!$j) {
            return;
        }
        $meta = \App\Modules\Competicoes\Domain\ChaveamentoRules::parse($j['nome_jogo']);
        if ($meta === \null) {
            return;
        }
        if (!\App\Modules\Competicoes\Domain\ChaveamentoRules::jogoEstaEncerrado((string) $j['status_jogo'])) {
            return;
        }
        $largura = $meta['largura'];
        $slot = $meta['slot'];
        $kind = $meta['kind'];
        $idModalidade = (int) $j['modalidades_id_modalidade'];
        if ($largura <= 1) {
            return;
        }
        $irmao = \App\Modules\Competicoes\Domain\ChaveamentoRules::slotIrmao($slot);
        $tagIrmaoN = \App\Modules\Competicoes\Domain\ChaveamentoRules::tag($largura, $irmao, 'N');
        $tagIrmaoB = \App\Modules\Competicoes\Domain\ChaveamentoRules::tag($largura, $irmao, 'B');
        $ji = \App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository::buscarJogoPorTag($conn, $idModalidade, $tagIrmaoN) ?? \App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository::buscarJogoPorTag($conn, $idModalidade, $tagIrmaoB);
        $w1 = \App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository::vencedorDoJogo($conn, (int) $j['id_jogo'], (string) $j['status_jogo'], $kind);
        if ($w1 === \null) {
            return;
        }
        // A grande final é terminal. Seu vencedor é usado diretamente para
        // classificação/pontuação; não criar uma partida solo adicional.
        if ($largura === 2) {
            self::removerDisputasPosicaoPendentes($conn, $idModalidade);
            return;
        }
        $lPai = \App\Modules\Competicoes\Domain\ChaveamentoRules::proximaLargura($largura);
        $slotPai = \App\Modules\Competicoes\Domain\ChaveamentoRules::slotPai($slot);
        $tagPai = \App\Modules\Competicoes\Domain\ChaveamentoRules::tag($lPai, $slotPai, 'N');
        if ($ji === \null) {
            $existente = \App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository::buscarJogoPorTag($conn, $idModalidade, $tagPai);
            if ($existente === \null) {
                $idPai = self::criarJogoDaFaseSeguinte($conn, $idModalidade, $tagPai, $j);
                \App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository::garantirPartidaEquipe($conn, $idPai, $w1);
            } else {
                $idPai = (int) $existente['id_jogo'];
                \App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository::garantirPartidaEquipe($conn, $idPai, $w1);
            }
            \App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository::tentarAutoconcluirPaiUmClube($conn, $idModalidade, $idPai);
            return;
        }
        if (!\App\Modules\Competicoes\Domain\ChaveamentoRules::jogoEstaEncerrado((string) $ji['status_jogo'])) {
            return;
        }
        $kindIrmao = (\App\Modules\Competicoes\Domain\ChaveamentoRules::parse($ji['nome_jogo']) ?? ['kind' => 'N'])['kind'];
        $w2 = \App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository::vencedorDoJogo($conn, (int) $ji['id_jogo'], (string) $ji['status_jogo'], $kindIrmao);
        if ($w2 === \null) {
            return;
        }
        $existente = \App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository::buscarJogoPorTag($conn, $idModalidade, $tagPai);
        if ($existente === \null) {
            $idNovo = self::criarJogoDaFaseSeguinte($conn, $idModalidade, $tagPai, $j);
            \App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository::garantirPartidaEquipe($conn, $idNovo, $w1);
            \App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository::garantirPartidaEquipe($conn, $idNovo, $w2);
            return;
        }
        $idPai = (int) $existente['id_jogo'];
        $partidasAtuais = \App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository::carregarPartidasJogo($conn, $idPai);
        $timesAtuais = \array_column($partidasAtuais, 'equipes_id_equipe');
        \sort($timesAtuais);
        $timesNovos = [$w1, $w2];
        \sort($timesNovos);

        $timesMudaram = ($timesAtuais !== $timesNovos);

        if ($timesMudaram) {
            $stClean = $conn->prepare("DELETE FROM partidas WHERE jogos_id_jogo = ? AND equipes_id_equipe NOT IN (?, ?)");
            self::desvincularHistoricoDasPartidas($conn, $idPai, [$w1, $w2]);
            $stClean->bind_param('iii', $idPai, $w1, $w2);
            $stClean->execute();
            $stClean->close();
            \App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository::garantirPartidaEquipe($conn, $idPai, $w1);
            \App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository::garantirPartidaEquipe($conn, $idPai, $w2);
            if (\App\Modules\Competicoes\Domain\ChaveamentoRules::jogoEstaEncerrado((string) $existente['status_jogo'])) {
                $stReabrir = $conn->prepare("UPDATE jogos SET status_jogo = 'Agendado' WHERE id_jogo = ?");
                $stReabrir->bind_param('i', $idPai);
                $stReabrir->execute();
                $stReabrir->close();
                $stReset = $conn->prepare("UPDATE partidas SET resultado_partida = 0 WHERE jogos_id_jogo = ?");
                $stReset->bind_param('i', $idPai);
                $stReset->execute();
                $stReset->close();
                self::limparAvancosPosteriores($conn, $idModalidade, $lPai);
            }
        } else {
            \App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository::garantirPartidaEquipe($conn, $idPai, $w1);
            \App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository::garantirPartidaEquipe($conn, $idPai, $w2);
        }
    }

    /** @param array<string,mixed> $jogoOrigem */
    private static function criarJogoDaFaseSeguinte(\mysqli $conn, int $idModalidade, string $tag, array $jogoOrigem): int
    {
        $statement = $conn->prepare("INSERT INTO jogos (nome_jogo, data_jogo, inicio_jogo, termino_jogo, status_jogo, modalidades_id_modalidade, locais_id_local)\r\n             VALUES (?, ?, NULL, NULL, 'Agendado', ?, ?)");
        $date = $jogoOrigem['data_jogo'] ?? null;
        $local = isset($jogoOrigem['locais_id_local']) ? (int) $jogoOrigem['locais_id_local'] : null;
        $statement->bind_param('ssii', $tag, $date, $idModalidade, $local);
        $statement->execute();
        $gameId = (int) $conn->insert_id;
        $statement->close();
        self::aplicarReservaAgenda($conn, $idModalidade, $tag, $gameId);
        return $gameId;
    }


    private static function limparAvancosPosteriores(\mysqli $conn, int $idModalidade, int $larguraOrigem): void
    {
        $st = $conn->prepare("SELECT id_jogo, nome_jogo FROM jogos WHERE modalidades_id_modalidade = ? AND nome_jogo LIKE 'MM:%'");
        $st->bind_param('i', $idModalidade);
        $st->execute();
        $games = $st->get_result()->fetch_all(\MYSQLI_ASSOC);
        $st->close();
        foreach ($games as $game) {
            $meta = \App\Modules\Competicoes\Domain\ChaveamentoRules::parse((string) $game['nome_jogo']);
            if ($meta === null || $meta['largura'] >= $larguraOrigem) {
                continue;
            }
            $gameId = (int) $game['id_jogo'];
            self::desvincularHistoricoDasPartidas($conn, $gameId);
            $stDelete = $conn->prepare('DELETE FROM partidas WHERE jogos_id_jogo = ?');
            $stDelete->bind_param('i', $gameId);
            $stDelete->execute();
            $stDelete->close();
            $stReset = $conn->prepare("UPDATE jogos SET status_jogo = 'Agendado' WHERE id_jogo = ?");
            $stReset->bind_param('i', $gameId);
            $stReset->execute();
            $stReset->close();
        }
    }

    public static function reconciliarAvancosPendentes(\mysqli $conn, int $idModalidade): void
    {
        $st = $conn->prepare("SELECT id_jogo FROM jogos
            WHERE modalidades_id_modalidade = ? AND nome_jogo LIKE 'MM:%'
              AND status_jogo IN ('Concluido', 'Finalizado')
            ORDER BY CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(nome_jogo, ':', 2), ':', -1) AS UNSIGNED) DESC, id_jogo ASC");
        $st->bind_param('i', $idModalidade);
        $st->execute();
        $games = $st->get_result()->fetch_all(\MYSQLI_ASSOC);
        $st->close();
        foreach ($games as $game) {
            self::chaveamentoProcessarAvanco($conn, (int) $game['id_jogo']);
        }
    }


    /**
     * Monta árvore JSON com hierarquia para o front.
     *
     * @return array{success:bool, jogos:list<array<string,mixed>>}
     */
    public static function montarJsonArvore(\mysqli $conn, int $idModalidade): array
    {
        $sql = 'SELECT j.id_jogo, j.nome_jogo, j.status_jogo, j.data_jogo, j.inicio_jogo,
                   j.termino_jogo, j.locais_id_local, l.nome_local,
                   p.id_partida, p.equipes_id_equipe, p.resultado_partida,
                   t.nome_turma, t.nome_fantasia_turma,
                   e.nome_equipe
            FROM jogos j
            LEFT JOIN locais l ON l.id_local = j.locais_id_local
            LEFT JOIN partidas p ON j.id_jogo = p.jogos_id_jogo
            LEFT JOIN equipes e ON p.equipes_id_equipe = e.id_equipe
            LEFT JOIN turmas t ON e.turmas_id_turma = t.id_turma
            WHERE j.modalidades_id_modalidade = ?
            ORDER BY j.id_jogo ASC, p.id_partida ASC';
        $st = $conn->prepare($sql);
        $st->bind_param('i', $idModalidade);
        $st->execute();
        $res = $st->get_result();
        $st->close();
        $porJogo = [];
        while ($row = $res->fetch_assoc()) {
            $idJ = (int) $row['id_jogo'];
            if (!isset($porJogo[$idJ])) {
                $meta = \App\Modules\Competicoes\Domain\ChaveamentoRules::parse($row['nome_jogo']);
                $porJogo[$idJ] = ['id_jogo' => $idJ, 'nome_jogo' => $row['nome_jogo'], 'status_jogo' => $row['status_jogo'], 'data_jogo' => $row['data_jogo'], 'inicio_jogo' => $row['inicio_jogo'], 'termino_jogo' => $row['termino_jogo'], 'locais_id_local' => $row['locais_id_local'] === null ? null : (int) $row['locais_id_local'], 'nome_local' => $row['nome_local'], 'meta' => $meta, 'partidas' => []];
            }
            if ($row['id_partida'] !== null) {
                $porJogo[$idJ]['partidas'][] = ['id_partida' => (int) $row['id_partida'], 'equipes_id_equipe' => (int) $row['equipes_id_equipe'], 'resultado_partida' => (int) $row['resultado_partida'], 'nome_turma' => $row['nome_turma'], 'nome_fantasia_turma' => $row['nome_fantasia_turma'], 'nome_equipe' => $row['nome_equipe']];
            }
        }
        $mapaChave = [];
        foreach ($porJogo as $idJ => $bloco) {
            $m = $bloco['meta'];
            if ($m !== \null) {
                $mapaChave[$m['largura'] . ':' . $m['slot'] . ':' . $m['kind']] = $idJ;
            }
        }
        $saida = [];
        $maiorFase = 0;
        foreach ($porJogo as $bloco) {
            $maiorFase = max($maiorFase, (int) ($bloco['meta']['largura'] ?? 0));
        }
        foreach ($porJogo as $bloco) {
            $m = $bloco['meta'];
            $faseNivel = $m['largura'] ?? \null;
            $slot = $m['slot'] ?? \null;
            $kind = $m['kind'] ?? 'N';
            $ehBye = $kind === 'B' || (\count($bloco['partidas']) === 1 && \App\Modules\Competicoes\Domain\ChaveamentoRules::jogoEstaEncerrado((string) $bloco['status_jogo']));
            $proximoId = \null;
            $ehDisputaPosicao = isset($m['posicao']);
            if ($faseNivel !== \null && $faseNivel > 1 && $slot !== \null) {
                $lp = \App\Modules\Competicoes\Domain\ChaveamentoRules::proximaLargura($faseNivel);
                $sp = \App\Modules\Competicoes\Domain\ChaveamentoRules::slotPai($slot);
                $chavePai = $lp . ':' . $sp . ':N';
                $proximoId = $mapaChave[$chavePai] ?? \null;
            }
            $venc = \null;
            if ($m !== \null) {
                $venc = \App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository::vencedorDoJogo($conn, $bloco['id_jogo'], (string) $bloco['status_jogo'], $kind);
            }
            $vagaGarantida = $ehBye || $venc !== \null && $proximoId !== \null || $venc !== \null && (int) $faseNivel === 1;
            $posicaoNaChave = $slot !== \null ? $slot + 1 : \null;
            $nomeFase = $faseNivel ? \App\Modules\Competicoes\Domain\ChaveamentoRules::nomeFasePt($faseNivel) : \null;
            if ($ehDisputaPosicao) {
                $posicaoNum = $m['posicao'];
                $nomeFase = \App\Modules\Competicoes\Domain\ChaveamentoRules::nomeFasePosicao($posicaoNum);
            }
            $nomeDisplay = $nomeFase && $posicaoNaChave ? $nomeFase . ' — confronto ' . $posicaoNaChave . ($ehBye ? ' (bye)' : '') : $bloco['nome_jogo'];
            $equipesOut = [];
            foreach ($bloco['partidas'] as $p) {
                $equipesOut[] = ['id_partida' => $p['id_partida'], 'id_equipe' => $p['equipes_id_equipe'], 'nome_turma' => $p['nome_turma'], 'nome_fantasia' => $p['nome_fantasia_turma'], 'nome_equipe' => $p['nome_equipe'], 'gols' => $p['resultado_partida']];
            }
            $saida[] = ['id_jogo' => $bloco['id_jogo'], 'nome_jogo' => $bloco['nome_jogo'], 'nome_jogo_display' => $nomeDisplay, 'nome_fase' => $nomeFase, 'fase_nivel' => $faseNivel, 'posicao_na_chave' => $posicaoNaChave, 'eh_bye' => $ehBye, 'eh_disputa_posicao' => $ehDisputaPosicao, 'status_jogo' => $bloco['status_jogo'], 'data_jogo' => $bloco['data_jogo'], 'inicio_jogo' => $bloco['inicio_jogo'], 'termino_jogo' => $bloco['termino_jogo'], 'locais_id_local' => $bloco['locais_id_local'], 'nome_local' => $bloco['nome_local'], 'exige_horario_agendado' => $faseNivel === null || $faseNivel >= $maiorFase, 'equipes' => $equipesOut, 'equipe_vencedora_id' => $venc, 'proximo_jogo_id' => $proximoId, 'vaga_garantida' => $vagaGarantida];
        }
        \usort($saida, static function (array $a, array $b): int {
            $fa = (int) ($a['fase_nivel'] ?? 0);
            $fb = (int) ($b['fase_nivel'] ?? 0);
            if ($fa !== $fb) {
                return $fb <=> $fa;
            }
            return (int) ($a['posicao_na_chave'] ?? 0) <=> (int) ($b['posicao_na_chave'] ?? 0);
        });
        return ['success' => \true, 'jogos' => $saida];
    }
    public static function perdedorDoJogo(\mysqli $conn, int $idJogo, string $statusJogo, string $kind): ?int
    {
        if (!\App\Modules\Competicoes\Domain\ChaveamentoRules::jogoEstaEncerrado($statusJogo)) {
            return \null;
        }
        $ps = \App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository::carregarPartidasJogo($conn, $idJogo);
        if ($kind === 'B' || \count($ps) < 2) {
            return \null;
        }
        return \App\Modules\Competicoes\Domain\ChaveamentoRules::perdedorDePartidas($ps);
    }
    public static function inserirJogoPosicao(\mysqli $conn, int $idModalidade, int $idLocal, int $posicao, int $idA, int $idB): int
    {
        $nome = 'POS:' . $posicao . ':0:N';
        $st = $conn->prepare("INSERT INTO jogos (nome_jogo, data_jogo, inicio_jogo, termino_jogo, status_jogo, modalidades_id_modalidade, locais_id_local)\r\n         VALUES (?, NULL, NULL, NULL, 'Agendado', ?, NULL)");
        $st->bind_param('si', $nome, $idModalidade);
        $st->execute();
        $idJogo = (int) $conn->insert_id;
        $st->close();
        self::aplicarReservaAgenda($conn, $idModalidade, $nome, $idJogo);
        $stP = $conn->prepare("INSERT INTO partidas (jogos_id_jogo, equipes_id_equipe, resultado_partida, status_partida) VALUES (?, ?, 0, '1')");
        $stP->bind_param('ii', $idJogo, $idA);
        $stP->execute();
        $stP->bind_param('ii', $idJogo, $idB);
        $stP->execute();
        $stP->close();
        return $idJogo;
    }
    /**
     * Verifica se todos os jogos de uma fase foram concluídos e gera disputas de posição.
     * Chamada ao final de sgi_chaveamento_processar_avanco().
     */
    public static function verificarGerarDisputasPosicao(\mysqli $conn, int $idModalidade, int $larguraFase): void
    {
        $tagLike = 'MM:' . $larguraFase . ':%';
        $stT = $conn->prepare("SELECT COUNT(*) AS total FROM jogos WHERE modalidades_id_modalidade = ? AND nome_jogo LIKE ?");
        $stT->bind_param('is', $idModalidade, $tagLike);
        $stT->execute();
        $total = (int) ($stT->get_result()->fetch_assoc()['total'] ?? 0);
        $stT->close();
        if ($total === 0) {
            return;
        }
        $stC = $conn->prepare("SELECT COUNT(*) AS c FROM jogos WHERE modalidades_id_modalidade = ? AND nome_jogo LIKE ? AND (status_jogo = 'Concluido' OR status_jogo = 'Finalizado')");
        $stC->bind_param('is', $idModalidade, $tagLike);
        $stC->execute();
        $concluidos = (int) ($stC->get_result()->fetch_assoc()['c'] ?? 0);
        $stC->close();
        if ($concluidos < $total) {
            return;
        }
        if ($larguraFase === 2) {
            \App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository::gerarDisputa3Lugar($conn, $idModalidade);
        }
    }
    public static function gerarDisputa3Lugar(\mysqli $conn, int $idModalidade): void
    {
        $existente = $conn->prepare("SELECT 1 FROM jogos WHERE modalidades_id_modalidade = ? AND nome_jogo = 'POS:3:0:N' LIMIT 1");
        $existente->bind_param('i', $idModalidade);
        $existente->execute();
        if ($existente->get_result()->num_rows > 0) {
            $existente->close();
            return;
        }
        $existente->close();
        // Os perdedores que disputam o 3º lugar são os das SEMIFINAIS (MM:4:%).
        // A verificação de gatilho continua sendo a conclusão da fase MM:2 (final),
        // momento em que ambas as semifinais já estão necessariamente encerradas.
        $st = $conn->prepare("SELECT id_jogo, status_jogo, nome_jogo FROM jogos WHERE modalidades_id_modalidade = ? AND nome_jogo LIKE 'MM:4:%'");
        $st->bind_param('i', $idModalidade);
        $st->execute();
        $semifinals = $st->get_result()->fetch_all(\MYSQLI_ASSOC);
        $st->close();
        if (\count($semifinals) < 2) {
            return;
        }
        $losers = [];
        foreach ($semifinals as $sf) {
            $meta = \App\Modules\Competicoes\Domain\ChaveamentoRules::parse($sf['nome_jogo']);
            if ($meta === \null) {
                continue;
            }
            $loser = \App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository::perdedorDoJogo($conn, (int) $sf['id_jogo'], (string) $sf['status_jogo'], $meta['kind']);
            if ($loser !== \null) {
                $losers[] = $loser;
            }
        }
        if (\count($losers) < 2) {
            return;
        }
        \App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository::inserirJogoPosicao($conn, $idModalidade, 0, 3, $losers[0], $losers[1]);
    }

    /**
     * Remove somente POS:3 que ainda não começou. Registros concluídos são
     * mantidos como histórico de uma regra antiga; os pendentes são resíduos
     * do gerador anterior e não podem continuar aparecendo na agenda.
     */
    public static function removerDisputasPosicaoPendentes(\mysqli $conn, int $idModalidade): void
    {
        $statement = $conn->prepare(
            "SELECT id_jogo FROM jogos
             WHERE modalidades_id_modalidade = ? AND nome_jogo = 'POS:3:0:N'
               AND status_jogo = 'Agendado' FOR UPDATE",
        );
        $statement->bind_param('i', $idModalidade);
        $statement->execute();
        $games = $statement->get_result()->fetch_all(\MYSQLI_ASSOC);
        $statement->close();

        foreach ($games as $game) {
            $gameId = (int) $game['id_jogo'];
            $credit = $conn->prepare('SELECT 1 FROM pontuacoes_podio WHERE id_jogo = ? LIMIT 1 FOR UPDATE');
            $credit->bind_param('i', $gameId);
            $credit->execute();
            $hasCredit = $credit->get_result()->num_rows > 0;
            $credit->close();
            if ($hasCredit) {
                continue;
            }

            self::desvincularHistoricoDasPartidas($conn, $gameId);
            $reservation = $conn->prepare(
                "DELETE FROM agenda_reservas
                 WHERE id_modalidade = ? AND chave_tag = 'POS:3:0:N' AND id_jogo = ?",
            );
            $reservation->bind_param('ii', $idModalidade, $gameId);
            $reservation->execute();
            $reservation->close();

            $parts = $conn->prepare('DELETE FROM partidas WHERE jogos_id_jogo = ?');
            $parts->bind_param('i', $gameId);
            $parts->execute();
            $parts->close();

            $delete = $conn->prepare('DELETE FROM jogos WHERE id_jogo = ? AND status_jogo = \'Agendado\'');
            $delete->bind_param('i', $gameId);
            $delete->execute();
            $delete->close();
        }

        // Uma reserva futura pode existir sem a linha de jogo materializada.
        // Ela também deixou de representar uma operação válida.
        $orphanReservation = $conn->prepare(
            "DELETE FROM agenda_reservas
             WHERE id_modalidade = ? AND chave_tag = 'POS:3:0:N' AND id_jogo IS NULL",
        );
        $orphanReservation->bind_param('i', $idModalidade);
        $orphanReservation->execute();
        $orphanReservation->close();
    }

    /**
     * Uma reserva pode existir antes da materialização do jogo futuro. Quando
     * o avanço cria a linha real, a programação é projetada para ela uma vez.
     */
    public static function aplicarReservaAgenda(\mysqli $conn, int $idModalidade, string $tag, int $idJogo): void
    {
        $statement = $conn->prepare('SELECT ar.id_reserva, ar.data_reserva, ar.inicio_reserva, ar.termino_reserva, ar.id_local FROM agenda_reservas ar INNER JOIN modalidades m ON m.id_modalidade = ar.id_modalidade AND m.interclasses_id_interclasse = ar.id_interclasse WHERE ar.id_modalidade = ? AND ar.chave_tag = ? AND ar.data_reserva IS NOT NULL AND ar.inicio_reserva IS NOT NULL AND ar.termino_reserva IS NOT NULL AND ar.id_local IS NOT NULL LIMIT 1');
        if ($statement === false) {
            return;
        }
        $statement->bind_param('is', $idModalidade, $tag);
        $statement->execute();
        $reservation = $statement->get_result()->fetch_assoc() ?: null;
        $statement->close();
        if ($reservation === null) {
            return;
        }
        $update = $conn->prepare('UPDATE jogos SET data_jogo = ?, inicio_jogo = ?, termino_jogo = ?, locais_id_local = ?, duracao_jogo = COALESCE(duracao_jogo, TIME_TO_SEC(TIMEDIFF(?, ?))), tempo_restante_jogo = COALESCE(tempo_restante_jogo, TIME_TO_SEC(TIMEDIFF(?, ?))) WHERE id_jogo = ? AND status_jogo = \'Agendado\'');
        $date = (string) $reservation['data_reserva'];
        $start = (string) $reservation['inicio_reserva'];
        $end = (string) $reservation['termino_reserva'];
        $local = (int) $reservation['id_local'];
        $update->bind_param('sssissssi', $date, $start, $end, $local, $end, $start, $end, $start, $idJogo);
        $update->execute();
        $update->close();
        $link = $conn->prepare('UPDATE agenda_reservas SET id_jogo = ? WHERE id_reserva = ? AND id_jogo IS NULL');
        $reservationId = (int) $reservation['id_reserva'];
        $link->bind_param('ii', $idJogo, $reservationId);
        $link->execute();
        $link->close();
    }
    /**
     * Verifica se o torneio da modalidade está totalmente concluído.
     */
    public static function torneioConcluido(\mysqli $conn, int $idModalidade): bool
    {
        $st = $conn->prepare("SELECT COUNT(*) AS c FROM jogos\r\n         WHERE modalidades_id_modalidade = ?\r\n           AND status_jogo NOT IN ('Concluido', 'Finalizado')\r\n           AND NOT (nome_jogo LIKE 'POS:3:%' AND status_jogo = 'Agendado')");
        $st->bind_param('i', $idModalidade);
        $st->execute();
        $pendentes = (int) ($st->get_result()->fetch_assoc()['c'] ?? 0);
        $st->close();
        return $pendentes === 0;
    }
    /**
     * Monta o histórico completo do torneio: classificação final + todos os confrontos.
     */
    public static function montarHistorico(\mysqli $conn, int $idModalidade): array
    {
        $concluido = \App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository::torneioConcluido($conn, $idModalidade);
        $stJ = $conn->prepare('SELECT j.id_jogo, j.nome_jogo, j.status_jogo, j.data_jogo,
                j.duracao_jogo, j.tempo_extra_jogo, j.inicio_jogo, j.termino_jogo,
                p.id_partida, p.equipes_id_equipe, p.resultado_partida,
                t.nome_turma, t.nome_fantasia_turma,
                e.nome_equipe
         FROM jogos j
         INNER JOIN partidas p ON j.id_jogo = p.jogos_id_jogo
         INNER JOIN equipes e ON p.equipes_id_equipe = e.id_equipe
         INNER JOIN turmas t ON e.turmas_id_turma = t.id_turma
         WHERE j.modalidades_id_modalidade = ?
         ORDER BY j.id_jogo ASC, p.resultado_partida DESC');
        $stJ->bind_param('i', $idModalidade);
        $stJ->execute();
        $rows = $stJ->get_result()->fetch_all(\MYSQLI_ASSOC);
        $stJ->close();
        $porJogo = [];
        foreach ($rows as $row) {
            $idJ = (int) $row['id_jogo'];
            if (!isset($porJogo[$idJ])) {
                $meta = \App\Modules\Competicoes\Domain\ChaveamentoRules::parse($row['nome_jogo']);
                $porJogo[$idJ] = ['id_jogo' => $idJ, 'nome_jogo' => $row['nome_jogo'], 'meta' => $meta, 'status_jogo' => $row['status_jogo'], 'data_jogo' => $row['data_jogo'], 'duracao_jogo' => $row['duracao_jogo'], 'tempo_extra_jogo' => $row['tempo_extra_jogo'], 'inicio_jogo' => $row['inicio_jogo'], 'termino_jogo' => $row['termino_jogo'], 'partidas' => []];
            }
            $porJogo[$idJ]['partidas'][] = ['id_equipe' => (int) $row['equipes_id_equipe'], 'gols' => (int) $row['resultado_partida'], 'nome_turma' => $row['nome_turma'], 'nome_fantasia' => $row['nome_fantasia_turma'], 'nome_equipe' => $row['nome_equipe']];
        }
        $classificacao = [];
        $confrontos = [];
        foreach ($porJogo as $jogo) {
            $meta = $jogo['meta'];
            $ps = $jogo['partidas'];
            if ($meta === \null || \count($ps) < 2) {
                continue;
            }
            \usort($ps, static fn ($a, $b) => $b['gols'] <=> $a['gols']);
            $vencedor = $ps[0];
            $perdedor = $ps[1];
            $fase = $meta['largura'];
            $posicao = $meta['posicao'] ?? \null;
            if (isset($meta['posicao'])) {
                $nomeFase = \App\Modules\Competicoes\Domain\ChaveamentoRules::nomeFasePosicao($meta['posicao']);
                $posVencedor = $meta['posicao'];
                $posPerdedor = $meta['posicao'] + 1;
                $classificacao[$posVencedor] = $vencedor;
                $classificacao[$posPerdedor] = $perdedor;
            } elseif ($fase === 2) {
                $classificacao[1] = $vencedor;
                $classificacao[2] = $perdedor;
                $nomeFase = 'Final';
            } else {
                $nomeFase = \App\Modules\Competicoes\Domain\ChaveamentoRules::nomeFasePt($fase);
            }
            $tempoExtra = (int) ($jogo['tempo_extra_jogo'] ?? 0);
            $duracao = (int) ($jogo['duracao_jogo'] ?? 0);
            $duracaoMin = $duracao > 0 ? (int) \ceil($duracao / 60) : \null;
            $extraMin = $tempoExtra > 0 ? (int) \ceil($tempoExtra / 60) : \null;
            $totalMin = ($duracaoMin ?? 0) + ($extraMin ?? 0);
            $confrontos[] = ['fase' => $nomeFase, 'vencedor_nome' => ($vencedor['nome_equipe'] ?: $vencedor['nome_fantasia']) ?: $vencedor['nome_turma'], 'vencedor_gols' => $vencedor['gols'], 'perdedor_nome' => ($perdedor['nome_equipe'] ?: $perdedor['nome_fantasia']) ?: $perdedor['nome_turma'], 'perdedor_gols' => $perdedor['gols'], 'duracao_min' => $duracaoMin, 'tempo_extra_min' => $extraMin, 'total_min' => $totalMin > 0 ? $totalMin : \null];
        }

        $final = null;
        $semifinais = [];
        foreach ($porJogo as $jogo) {
            $meta = $jogo['meta'];
            if ($meta === null || !ChaveamentoRules::jogoEstaEncerrado((string) $jogo['status_jogo'])) {
                continue;
            }
            if ($meta['largura'] === 2 && !isset($meta['posicao']) && count($jogo['partidas']) >= 2) {
                $final = $jogo;
            } elseif ($meta['largura'] === 4 && !isset($meta['posicao'])) {
                $semifinais[] = [
                    'kind' => $meta['kind'],
                    'partidas' => array_map(static fn (array $partida): array => [
                        'equipes_id_equipe' => (int) $partida['id_equipe'],
                        'resultado_partida' => (int) $partida['gols'],
                    ], $jogo['partidas']),
                ];
            }
        }
        if ($final !== null) {
            $finalParts = array_map(static fn (array $partida): array => [
                'equipes_id_equipe' => (int) $partida['id_equipe'],
                'resultado_partida' => (int) $partida['gols'],
            ], $final['partidas']);
            $thirdTeamId = ChaveamentoRules::terceiroLugarDoCampeao(
                ChaveamentoRules::vencedorDePartidas($finalParts),
                $semifinais,
            );
            if ($thirdTeamId !== null) {
                foreach ($semifinais as $semifinal) {
                    foreach ($semifinal['partidas'] as $partida) {
                        if ((int) $partida['equipes_id_equipe'] === $thirdTeamId) {
                            foreach ($porJogo as $jogo) {
                                foreach ($jogo['partidas'] as $candidate) {
                                    if ((int) $candidate['id_equipe'] === $thirdTeamId) {
                                        $classificacao[3] = $candidate;
                                        break 2;
                                    }
                                }
                            }
                            break 2;
                        }
                    }
                }
            }
        }
        if (!isset($classificacao[1]) && !isset($classificacao[2])) {
            \usort($confrontos, static function ($a, $b) {
                $order = ['Final' => 1, 'Semifinal' => 2, 'Disputa de 3º lugar' => 3, 'Quartas de final' => 4, 'Oitavas de final' => 5];
                $oa = $order[$a['fase']] ?? 99;
                $ob = $order[$b['fase']] ?? 99;
                return $oa <=> $ob;
            });
        }
        \ksort($classificacao);
        return ['success' => \true, 'concluido' => $concluido, 'classificacao' => \array_values($classificacao), 'confrontos' => $confrontos];
    }
}
