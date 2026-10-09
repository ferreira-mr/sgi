<?php

declare(strict_types=1);

namespace Tests\Unit\Modules\Competicoes;

use App\Modules\Competicoes\Domain\ChaveamentoRules;
use PHPUnit\Framework\TestCase;

final class ChaveamentoRulesTest extends TestCase
{
    public function testTagsPreserveTheOfflineProtocol(): void
    {
        self::assertSame('MM:8:2:N', ChaveamentoRules::tag(8, 2, 'N'));
        self::assertNull(ChaveamentoRules::parse('jogo sem tag'));
        $metadata = ChaveamentoRules::parse('MM:8:2:N');
        self::assertSame(8, $metadata['largura']);
        self::assertSame(2, $metadata['slot']);
    }

    public function testPublishedScheduleTagCarriesTheSameBracketPosition(): void
    {
        self::assertSame([
            'largura' => 4,
            'slot' => 1,
            'kind' => 'N',
            'planejado' => true,
            'modalidade' => 27,
            'turma' => 0,
        ], ChaveamentoRules::parse('PL:27:0:MM:4:1:N'));
        self::assertSame([
            'largura' => 8,
            'slot' => 1,
            'kind' => 'N',
            'planejado' => true,
            'modalidade' => 27,
            'formato_legado' => true,
        ], ChaveamentoRules::parse('PL:27:MM:8:1:N'));
        self::assertNull(ChaveamentoRules::parse('PL:27:0:IND:0'));
    }

    public function testSiblingAndParentSlotsStayConsistent(): void
    {
        foreach (range(0, 15) as $slot) {
            $sibling = ChaveamentoRules::slotIrmao($slot);
            self::assertNotSame($slot, $sibling);
            self::assertSame($slot, ChaveamentoRules::slotIrmao($sibling));
            self::assertSame(ChaveamentoRules::slotPai($slot), ChaveamentoRules::slotPai($sibling));
        }
    }

    public function testDescendantSlotsAreMappedToTheirAncestorBranch(): void
    {
        self::assertTrue(ChaveamentoRules::slotPertenceAoRamo(4, 0, 8, 0));
        self::assertTrue(ChaveamentoRules::slotPertenceAoRamo(4, 0, 8, 1));
        self::assertFalse(ChaveamentoRules::slotPertenceAoRamo(4, 0, 8, 2));
        self::assertTrue(ChaveamentoRules::slotPertenceAoRamo(2, 0, 8, 0));
        self::assertTrue(ChaveamentoRules::slotPertenceAoRamo(2, 0, 8, 3));
        self::assertFalse(ChaveamentoRules::slotPertenceAoRamo(2, 0, 8, 4));
        self::assertFalse(ChaveamentoRules::slotPertenceAoRamo(4, 0, 6, 0));
    }

    public function testInitialBracketAlternatesByesAcrossEveryRound(): void
    {
        for ($teamCount = 3; $teamCount <= 63; $teamCount++) {
            for ($attempt = 0; $attempt < 3; $attempt++) {
                $slots = ChaveamentoRules::distribuirEquipesNaChaveInicial(range(1, $teamCount));
                self::assertCount(ChaveamentoRules::proximoPow2($teamCount), $slots);
                self::assertCount($teamCount, array_filter($slots, static fn (?int $teamId): bool => $teamId !== null));
                self::assertCount($teamCount, array_unique(array_filter($slots)));

                $types = [];
                for ($slot = 0; $slot < count($slots); $slot += 2) {
                    $occupied = (int) ($slots[$slot] !== null) + (int) ($slots[$slot + 1] !== null);
                    $types[] = match ($occupied) {
                        2 => 'N',
                        1 => 'B',
                        default => 'E',
                    };
                }
                self::assertSame(intdiv($teamCount, 2), count(array_filter($types, static fn (string $type): bool => $type === 'N')));
                self::assertSame($teamCount % 2, count(array_filter($types, static fn (string $type): bool => $type === 'B')));

                $teamsInRound = $teamCount;
                $gamesInRound = intdiv(count($slots), 2);
                while (count($types) > 1) {
                    self::assertSame(intdiv($teamsInRound, 2), count(array_filter($types, static fn (string $type): bool => $type === 'N')));
                    self::assertSame($teamsInRound % 2, count(array_filter($types, static fn (string $type): bool => $type === 'B')));
                    self::assertSame($gamesInRound - intdiv($teamsInRound, 2) - ($teamsInRound % 2), count(array_filter($types, static fn (string $type): bool => $type === 'E')));
                    $nextRound = [];
                    for ($slot = 0; $slot < count($types); $slot += 2) {
                        $left = $types[$slot];
                        $right = $types[$slot + 1];
                        if ($left === 'B') {
                            self::assertNotSame('E', $right, 'A bye team must play in the following round.');
                        }
                        if ($right === 'B') {
                            self::assertNotSame('E', $left, 'A bye team must play in the following round.');
                        }

                        if ($left === 'E' && $right === 'E') {
                            $nextRound[] = 'E';
                        } elseif ($left === 'E' || $right === 'E') {
                            $occupied = $left === 'E' ? $right : $left;
                            self::assertSame('N', $occupied, 'A new bye must come from a previous-round match winner.');
                            $nextRound[] = 'B';
                        } else {
                            $nextRound[] = 'N';
                        }
                    }

                    $nextTeams = 2 * count(array_filter($nextRound, static fn (string $type): bool => $type === 'N'))
                        + count(array_filter($nextRound, static fn (string $type): bool => $type === 'B'));
                    self::assertSame((int) ceil($teamsInRound / 2), $nextTeams, 'Unexpected advancement count for ' . $teamCount . ' teams in round of ' . $teamsInRound . ' (' . implode(',', $types) . ').');
                    $types = $nextRound;
                    $teamsInRound = $nextTeams;
                    $gamesInRound = intdiv($gamesInRound, 2);
                }

                self::assertSame('N', $types[0], 'The final must always be contested.');
            }
        }
    }

    public function testDerivesThirdPlaceFromTheChampionsSemifinalLoser(): void
    {
        self::assertSame(12, ChaveamentoRules::terceiroLugarDoCampeao(10, [
            [
                'kind' => 'N',
                'partidas' => [
                    ['equipes_id_equipe' => 10, 'resultado_partida' => 3],
                    ['equipes_id_equipe' => 12, 'resultado_partida' => 1],
                ],
            ],
            [
                'kind' => 'N',
                'partidas' => [
                    ['equipes_id_equipe' => 20, 'resultado_partida' => 2],
                    ['equipes_id_equipe' => 22, 'resultado_partida' => 0],
                ],
            ],
        ]));
    }

    public function testByeSemifinalDoesNotCreateThirdPlace(): void
    {
        self::assertNull(ChaveamentoRules::terceiroLugarDoCampeao(10, [
            [
                'kind' => 'B',
                'partidas' => [
                    ['equipes_id_equipe' => 10, 'resultado_partida' => 1],
                ],
            ],
            [
                'kind' => 'N',
                'partidas' => [
                    ['equipes_id_equipe' => 20, 'resultado_partida' => 2],
                    ['equipes_id_equipe' => 22, 'resultado_partida' => 0],
                ],
            ],
        ]));
    }
}
