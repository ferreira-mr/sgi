<?php

declare(strict_types=1);

namespace App\Modules\Sincronizacao\Infrastructure;

use App\Modules\Competicoes\Application\ModalidadeNaoEncontradaException;
use App\Modules\Competicoes\Application\PlacarService;
use App\Modules\Competicoes\Domain\ChaveamentoRules;
use App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository;
use App\Modules\Competicoes\Infrastructure\MysqliPontoRepository;
use App\Modules\Competicoes\Application\IndividualRankingService;
use App\Modules\Competicoes\Infrastructure\MysqliIndividualRankingRepository;
use App\Modules\Competicoes\Domain\TipoCompeticaoRules;
use App\Modules\Resultados\Application\PontuacaoService;
use App\Modules\Resultados\Infrastructure\MysqliPodioRepository;
use App\Shared\Application\TransactionRunner;
use App\Shared\Database\MysqliTransactionRunner;
use mysqli;
use RuntimeException;

final class MysqliChaveamentoSyncGateway
{
    private ?bool $planningAvailable = null;

    private readonly TransactionRunner $transactions;
    private readonly PontuacaoService $pontuacao;
    private readonly IndividualRankingService $individual;

    public function __construct(
        private readonly mysqli $connection,
        ?TransactionRunner $transactions = null,
        ?PontuacaoService $pontuacao = null,
        ?IndividualRankingService $individual = null,
    ) {
        $this->transactions = $transactions ?? new MysqliTransactionRunner($connection);
        $this->pontuacao = $pontuacao ?? new PontuacaoService(new MysqliPodioRepository($connection));
        $this->individual = $individual ?? new IndividualRankingService(new MysqliIndividualRankingRepository($connection));
    }

    public function editionOfModality(int $modalityId): ?int
    {
        $statement = $this->connection->prepare('SELECT interclasses_id_interclasse FROM modalidades WHERE id_modalidade = ? LIMIT 1');
        if ($statement === false) {
            throw new RuntimeException('Não foi possível consultar modalidade.');
        }
        $statement->bind_param('i', $modalityId);
        $statement->execute();
        $row = $statement->get_result()->fetch_assoc();
        $statement->close();
        return $row === null ? null : (int) $row['interclasses_id_interclasse'];
    }

    public function modalityType(int $modalityId): ?string
    {
        $statement = $this->connection->prepare('SELECT m.tipos_modalidades_id_tipo_modalidade, tm.nome_tipo_modalidade FROM modalidades m LEFT JOIN tipos_modalidades tm ON tm.id_tipo_modalidade = m.tipos_modalidades_id_tipo_modalidade WHERE m.id_modalidade = ? LIMIT 1');
        if ($statement === false) {
            throw new RuntimeException('Não foi possível consultar modalidade.');
        }
        $statement->bind_param('i', $modalityId);
        $statement->execute();
        $row = $statement->get_result()->fetch_assoc();
        $statement->close();
        return $row === null ? null : TipoCompeticaoRules::resolve($row);
    }

    /** @param array<string, mixed> $data @return array<string, mixed> */
    public function sync(int $modalityId, string $type, array $data): array
    {
        return $this->transactions->run(function () use ($modalityId, $type, $data): array {
            $actualType = $this->modalityType($modalityId);
            if ($actualType === null) {
                $edition = $this->editionOfModality($modalityId);
                if ($edition === null) {
                    throw new ModalidadeNaoEncontradaException('Modalidade não encontrada.');
                }
                throw new \InvalidArgumentException('O tipo da modalidade não está configurado.');
            }
            if ($type === 'individual' && $actualType !== TipoCompeticaoRules::INDIVIDUAL) {
                throw new \InvalidArgumentException('A modalidade informada não é individual.');
            }
            if ($type === 'mata_mata' && $actualType === TipoCompeticaoRules::INDIVIDUAL) {
                throw new \InvalidArgumentException('Modalidades individuais não aceitam sincronização de mata-mata.');
            }
            if ($type === 'individual') {
                $ranking = $data['ranking'] ?? null;
                if (!is_array($ranking) || !isset($ranking['primeiro'], $ranking['segundo'], $ranking['terceiro'])) {
                    throw new \InvalidArgumentException('Dados de ranking incompletos para modalidade individual.');
                }
                $gameId = null;
                if (array_key_exists('id_jogo', $data)) {
                    $rawGameId = $data['id_jogo'];
                    if (is_int($rawGameId)) {
                        $gameId = $rawGameId;
                    } elseif (is_string($rawGameId) && preg_match('/^[1-9][0-9]*$/', trim($rawGameId)) === 1) {
                        $gameId = filter_var(trim($rawGameId), FILTER_VALIDATE_INT, [
                            'options' => ['min_range' => 1, 'max_range' => PHP_INT_MAX],
                        ]);
                    }
                    if (!is_int($gameId) || $gameId <= 0) {
                        throw new \InvalidArgumentException('O ID do jogo deve ser um inteiro positivo.');
                    }
                }
                $result = $this->individual->registrar($modalityId, [
                    'primeiro' => $ranking['primeiro'],
                    'segundo' => $ranking['segundo'],
                    'terceiro' => $ranking['terceiro'],
                ], $gameId);
                return ['success' => true, 'message' => 'Sincronização de modalidade individual concluída com sucesso.', 'detalhes' => $result];
            }
            if ($type !== 'mata_mata') {
                throw new \InvalidArgumentException('Tipo de modalidade não suportado.');
            }
            $games = $data['jogos'] ?? [];
            if (!is_array($games) || $games === []) {
                throw new \InvalidArgumentException('Nenhum jogo enviado para sincronização de mata-mata.');
            }
            $validation = $this->validateMataMataPayload($modalityId, $games);
            $this->assertPublishedPlanDoesNotGainParallelGames($modalityId, $validation['games']);
            $games = $validation['games'];
            $processed = 0;
            foreach ($games as $game) {
                $name = $game['nome_jogo'];
                $status = $game['status_jogo'];
                $existingId = $game['existing_id'];
                if ($existingId !== null) {
                    $gameId = $existingId;
                    $statement = $this->prepare('UPDATE jogos SET status_jogo = ? WHERE id_jogo = ?');
                    $statement->bind_param('si', $status, $gameId);
                } else {
                    $statement = $this->prepare("INSERT INTO jogos (nome_jogo, data_jogo, inicio_jogo, termino_jogo, status_jogo, modalidades_id_modalidade, locais_id_local) VALUES (?, NULL, NULL, NULL, ?, ?, NULL)");
                    $statement->bind_param('ssi', $name, $status, $modalityId);
                }
                $statement->execute();
                if ($existingId === null) {
                    $gameId = (int) $this->connection->insert_id;
                }
                $statement->close();
                MysqliChaveamentoRepository::aplicarReservaAgenda($this->connection, $modalityId, $name, $gameId);
                foreach ($game['partidas'] as $part) {
                    $teamId = $part['id_equipe'];
                    $score = $part['resultado'];
                    $this->validarPontuacaoSincronizada($gameId, $teamId, $score);
                    $current = $this->one('SELECT id_partida FROM partidas WHERE jogos_id_jogo = ? AND equipes_id_equipe = ? LIMIT 1', 'ii', [$gameId, $teamId]);
                    if ($current !== null) {
                        $statement = $this->prepare('UPDATE partidas SET resultado_partida = ? WHERE id_partida = ?');
                        $partId = (int) $current['id_partida'];
                        $statement->bind_param('ii', $score, $partId);
                    } else {
                        $statement = $this->prepare("INSERT INTO partidas (jogos_id_jogo, equipes_id_equipe, resultado_partida, status_partida) VALUES (?, ?, ?, '1')");
                        $statement->bind_param('iii', $gameId, $teamId, $score);
                    }
                    $statement->execute();
                    $statement->close();
                }
                $processed++;
            }
            if ($validation['rebuild_from_round'] !== null) {
                MysqliChaveamentoRepository::chaveamentoRebuildFromRound(
                    $this->connection,
                    $modalityId,
                    $validation['rebuild_from_round'],
                );
            }
            $statement = $this->prepare("SELECT id_jogo, nome_jogo FROM jogos WHERE modalidades_id_modalidade = ? AND (nome_jogo LIKE 'MM:%' OR nome_jogo LIKE 'POS:3:%') AND status_jogo IN ('Concluido', 'Finalizado') ORDER BY id_jogo ASC");
            $statement->bind_param('i', $modalityId);
            $statement->execute();
            $completed = $statement->get_result()->fetch_all(MYSQLI_ASSOC);
            $statement->close();
            foreach ($completed as $game) {
                $this->pontuacao->reconciliarJogo((int) $game['id_jogo']);
                if ($validation['rebuild_from_round'] === null && str_starts_with((string) $game['nome_jogo'], 'MM:')) {
                    MysqliChaveamentoRepository::chaveamentoProcessarAvanco($this->connection, (int) $game['id_jogo']);
                }
            }
            return ['success' => true, 'message' => 'Sincronização de chaveamento Mata-Mata realizada com sucesso.', 'jogos_sincronizados' => $processed];
        });
    }

    /**
     * Persisted offline batches may still update legacy games that already
     * exist. They cannot introduce a second bracket after a calendar is
     * published; temporary planned results reconcile through /resultados.
     *
     * @param list<array{existing_id:?int}> $games
     */
    private function assertPublishedPlanDoesNotGainParallelGames(int $modalityId, array $games): void
    {
        if (!$this->planningAvailable()) {
            return;
        }
        $published = $this->one(
            "SELECT 1 AS published
             FROM modalidades m
             INNER JOIN interclasse_planejamentos ip ON ip.id_interclasse = m.interclasses_id_interclasse
             WHERE m.id_modalidade = ?
               AND ip.cronograma_status = 'publicado'
               AND ip.versao_publicada IS NOT NULL
             LIMIT 1",
            'i',
            [$modalityId],
        );
        if ($published === null) {
            return;
        }
        foreach ($games as $game) {
            if ($game['existing_id'] === null) {
                throw new \InvalidArgumentException('O calendário publicado é a única fonte para criar os jogos desta edição.');
            }
        }
    }

    private function planningAvailable(): bool
    {
        if ($this->planningAvailable !== null) {
            return $this->planningAvailable;
        }
        $result = $this->connection->query(
            "SELECT COUNT(*) AS total FROM information_schema.tables
             WHERE table_schema = DATABASE() AND table_name = 'interclasse_planejamentos'",
        );
        if ($result === false) {
            return $this->planningAvailable = false;
        }
        $row = $result->fetch_assoc();
        $result->free();
        return $this->planningAvailable = ((int) ($row['total'] ?? 0) > 0);
    }

    /**
     * Validate and normalize every game before the first write.
     *
     * @param array<array-key,mixed> $games
     * @return array{
     *     games:list<array{
     *         nome_jogo:string,
     *         status_jogo:string,
     *         existing_id:?int,
     *         existing_parts:list<array{team_id:int,score:int,part_id:int}>,
     *         meta:array{largura:int,slot:int,kind:string,posicao?:int}|null,
     *         partidas:list<array{id_equipe:int,resultado:int}>
     *     }>,
     *     rebuild_from_round:?int
     * }
     */
    private function validateMataMataPayload(int $modalityId, array $games): array
    {
        $lock = $this->prepare('SELECT id_modalidade FROM modalidades WHERE id_modalidade = ? FOR UPDATE');
        $lock->bind_param('i', $modalityId);
        $lock->execute();
        $lockedModality = $lock->get_result()->fetch_column();
        $lock->close();
        if ($lockedModality === false) {
            throw new ModalidadeNaoEncontradaException('Modalidade não encontrada.');
        }
        if ($this->editionOfModality($modalityId) === null) {
            throw new ModalidadeNaoEncontradaException('Modalidade não encontrada.');
        }
        if (!array_is_list($games) || $games === []) {
            throw new \InvalidArgumentException('Nenhum jogo válido foi enviado para sincronização.');
        }

        $normalized = [];
        $names = [];
        $teamIds = [];
        foreach ($games as $game) {
            if (!is_array($game)) {
                throw new \InvalidArgumentException('Cada jogo precisa ser um objeto válido.');
            }
            $name = $game['nome_jogo'] ?? null;
            if (!is_string($name) || trim($name) === '') {
                throw new \InvalidArgumentException('Cada jogo precisa de um nome válido.');
            }
            if (isset($names[$name])) {
                throw new \InvalidArgumentException('O lote não pode repetir a mesma tag de jogo.');
            }
            $names[$name] = true;

            $requestedStatus = null;
            if (array_key_exists('status_jogo', $game)) {
                if (!is_string($game['status_jogo'])) {
                    throw new \InvalidArgumentException('O estado do jogo é inválido.');
                }
                $requestedStatus = $game['status_jogo'];
            }
            $meta = $this->parseSyncTag($name);

            $rawParts = $game['partidas'] ?? null;
            if (!is_array($rawParts) || !array_is_list($rawParts) || $rawParts === []) {
                throw new \InvalidArgumentException('Cada jogo precisa informar suas partidas.');
            }
            if (count($rawParts) > 2) {
                throw new \InvalidArgumentException('Cada jogo pode ter no máximo duas equipes participantes.');
            }

            $parts = [];
            $seenTeams = [];
            foreach ($rawParts as $part) {
                if (!is_array($part)) {
                    throw new \InvalidArgumentException('Partida inválida na sincronização.');
                }
                $teamId = $this->normalizeSyncTeamId($part['id_equipe'] ?? null);
                if (isset($seenTeams[$teamId])) {
                    throw new \InvalidArgumentException('As equipes de cada jogo devem ser distintas.');
                }
                $seenTeams[$teamId] = true;
                $score = PlacarService::normalizarPontuacao($part['resultado'] ?? 0);
                $parts[] = ['id_equipe' => $teamId, 'resultado' => $score];
                $teamIds[] = $teamId;
            }

            $normalized[] = [
                'nome_jogo' => $name,
                'requested_status' => $requestedStatus,
                'status_jogo' => '',
                'existing_id' => null,
                'existing_parts' => [],
                'meta' => $meta,
                'partidas' => $parts,
            ];
        }

        $snapshot = $this->loadSyncSnapshot($modalityId, array_keys($names));
        $this->validateTeamsForModality($modalityId, array_values(array_unique($teamIds)));

        foreach ($normalized as &$game) {
            $matches = $snapshot[$game['nome_jogo']] ?? [];
            if (count($matches) > 1) {
                throw new \InvalidArgumentException('A tag do jogo está ambígua nesta modalidade.');
            }
            $existing = $matches[0] ?? null;
            if ($existing !== null && $existing['duplicate_participants']) {
                throw new \InvalidArgumentException('O jogo persistido possui participantes duplicados.');
            }
            $storedStatus = $existing['status'] ?? null;
            $requestedStatus = $game['requested_status'];
            $effectiveStatus = $requestedStatus ?? $storedStatus ?? 'Agendado';
            $game['status_jogo'] = $this->normalizeSyncStatus($effectiveStatus);
            $game['existing_id'] = $existing['id'] ?? null;
            $game['existing_parts'] = $existing['parts'] ?? [];

            if ($storedStatus !== null) {
                $currentStatus = $this->normalizeSyncStatus($storedStatus);
                if (ChaveamentoRules::jogoEstaEncerrado($currentStatus)
                    && !ChaveamentoRules::jogoEstaEncerrado($game['status_jogo'])) {
                    throw new \InvalidArgumentException('Um jogo concluído não pode voltar a um estado em andamento.');
                }
                if (in_array($currentStatus, ['Iniciado', 'Pausado'], true) && $game['status_jogo'] === 'Agendado') {
                    throw new \InvalidArgumentException('Um jogo iniciado não pode voltar a ser agendado.');
                }
            }
            unset($game['requested_status']);
        }
        unset($game);

        $projected = $this->projectSyncGames($snapshot);
        foreach ($normalized as $game) {
            $projected[$game['nome_jogo']] = [
                'name' => $game['nome_jogo'],
                'status' => $game['status_jogo'],
                'meta' => $game['meta'],
                'parts' => array_map(static fn (array $part): array => [
                    'team_id' => $part['id_equipe'],
                    'score' => $part['resultado'],
                    'part_id' => 0,
                ], $game['partidas']),
            ];
        }

        foreach ($normalized as $game) {
            $teamIdsForGame = array_column($game['partidas'], 'id_equipe');
            sort($teamIdsForGame, SORT_NUMERIC);
            $existingTeamIds = array_column($game['existing_parts'], 'team_id');
            sort($existingTeamIds, SORT_NUMERIC);

            if ($game['meta'] === null) {
                if ($existingTeamIds !== [] && $existingTeamIds !== $teamIdsForGame) {
                    throw new \InvalidArgumentException('A sincronização não pode substituir os participantes já vinculados ao jogo.');
                }
            } else {
                $this->validateStructuralParticipants($game, $teamIdsForGame, $existingTeamIds, $projected, $snapshot);
            }

            if (count($game['partidas']) === 2 && ChaveamentoRules::jogoEstaEncerrado($game['status_jogo'])) {
                (new PlacarService())->validarFinalizacao(array_column($game['partidas'], 'resultado'));
            }

            foreach ($game['partidas'] as $part) {
                $requiresLink = ($game['meta']['kind'] ?? null) !== 'B'
                    && ($snapshot[$game['nome_jogo']][0]['requires_link'] ?? true);
                if ($requiresLink) {
                    $existingPart = null;
                    foreach ($game['existing_parts'] as $storedPart) {
                        if ($storedPart['team_id'] === $part['id_equipe']) {
                            $existingPart = $storedPart;
                            break;
                        }
                    }
                    $this->validateLinkedScore($existingPart['part_id'] ?? null, $part['resultado']);
                }
            }
        }

        $rebuildFromRound = $this->detectDownstreamRebuild($normalized, $snapshot, $projected);
        return ['games' => $normalized, 'rebuild_from_round' => $rebuildFromRound];
    }

    /** @return array{largura:int,slot:int,kind:string,posicao?:int}|null */
    private function parseSyncTag(string $name): ?array
    {
        $isStructural = preg_match('/^(?:MM|POS):/i', trim($name)) === 1;
        $meta = ChaveamentoRules::parse($name);
        if (!$isStructural) {
            return null;
        }
        if ($meta === null) {
            throw new \InvalidArgumentException('A tag estrutural do jogo é inválida.');
        }
        if (str_starts_with($name, 'MM:')) {
            $width = $meta['largura'];
            if ($width < 2 || $width > 2147483647 || ($width & ($width - 1)) !== 0 || $meta['slot'] >= intdiv($width, 2)) {
                throw new \InvalidArgumentException('A largura ou o slot da fase mata-mata é inválido.');
            }
        } elseif (($meta['posicao'] ?? 0) !== 3 || $meta['slot'] !== 0 || $meta['kind'] !== 'N') {
            throw new \InvalidArgumentException('A tag de disputa de posição não é suportada.');
        }
        return $meta;
    }

    private function normalizeSyncTeamId(mixed $value): int
    {
        if (is_int($value)) {
            $normalized = $value;
        } elseif (is_string($value)) {
            $digits = trim($value);
            if (preg_match('/^[0-9]+$/D', $digits) !== 1) {
                throw new \InvalidArgumentException('As equipes de cada jogo devem ser válidas.');
            }
            $digits = ltrim($digits, '0');
            $digits = $digits === '' ? '0' : $digits;
            if (strlen($digits) > 10 || (strlen($digits) === 10 && strcmp($digits, '2147483647') > 0)) {
                throw new \InvalidArgumentException('As equipes de cada jogo devem ser válidas.');
            }
            $normalized = (int) $digits;
        } else {
            throw new \InvalidArgumentException('As equipes de cada jogo devem ser válidas.');
        }
        if ($normalized <= 0 || $normalized > 2147483647) {
            throw new \InvalidArgumentException('As equipes de cada jogo devem ser válidas.');
        }
        return $normalized;
    }

    private function normalizeSyncStatus(mixed $status): string
    {
        if (!is_string($status)) {
            throw new \InvalidArgumentException('O estado do jogo é inválido.');
        }
        if ($status === 'Finalizado') {
            return 'Concluido';
        }
        if (!in_array($status, ['Agendado', 'Iniciado', 'Pausado', 'Concluido'], true)) {
            throw new \InvalidArgumentException('O estado do jogo é inválido.');
        }
        return $status;
    }

    /**
     * @param list<string> $requestedNames
     * @return array<string,list<array{
     *     id:int,name:string,status:string,requires_link:bool,
     *     parts:list<array{team_id:int,score:int,part_id:int}>,duplicate_participants:bool
     * }>>
     */
    private function loadSyncSnapshot(int $modalityId, array $requestedNames): array
    {
        $sql = "SELECT id_jogo, nome_jogo, status_jogo, exige_vinculo_ponto
                FROM jogos
                WHERE modalidades_id_modalidade = ?
                  AND (nome_jogo LIKE 'MM:%' OR nome_jogo LIKE 'POS:%'";
        $types = 'i';
        $params = [$modalityId];
        if ($requestedNames !== []) {
            $sql .= ' OR nome_jogo IN (' . implode(',', array_fill(0, count($requestedNames), '?')) . ')';
            $types .= str_repeat('s', count($requestedNames));
            array_push($params, ...$requestedNames);
        }
        $sql .= ') ORDER BY id_jogo FOR UPDATE';
        $statement = $this->prepare($sql);
        $statement->bind_param($types, ...$params);
        $statement->execute();
        $rows = $statement->get_result()->fetch_all(MYSQLI_ASSOC);
        $statement->close();

        $gamesById = [];
        $ids = [];
        foreach ($rows as $row) {
            $id = (int) $row['id_jogo'];
            $ids[] = $id;
            $gamesById[$id] = [
                'id' => $id,
                'name' => (string) $row['nome_jogo'],
                'status' => (string) $row['status_jogo'],
                'requires_link' => (int) $row['exige_vinculo_ponto'] === 1,
                'parts' => [],
                'duplicate_participants' => false,
            ];
        }

        if ($ids !== []) {
            $partStatement = $this->prepare(
                'SELECT id_partida, jogos_id_jogo, equipes_id_equipe, resultado_partida
                 FROM partidas WHERE jogos_id_jogo IN (' . implode(',', array_fill(0, count($ids), '?')) . ')
                 ORDER BY id_partida FOR UPDATE',
            );
            $partStatement->bind_param(str_repeat('i', count($ids)), ...$ids);
            $partStatement->execute();
            $parts = $partStatement->get_result()->fetch_all(MYSQLI_ASSOC);
            $partStatement->close();
            foreach ($parts as $part) {
                $gameId = (int) $part['jogos_id_jogo'];
                $teamId = (int) $part['equipes_id_equipe'];
                foreach ($gamesById[$gameId]['parts'] as $storedPart) {
                    if ($storedPart['team_id'] === $teamId) {
                        $gamesById[$gameId]['duplicate_participants'] = true;
                        break;
                    }
                }
                $gamesById[$gameId]['parts'][] = [
                    'team_id' => $teamId,
                    'score' => (int) $part['resultado_partida'],
                    'part_id' => (int) $part['id_partida'],
                ];
            }
        }

        $byName = [];
        foreach ($gamesById as $game) {
            $byName[$game['name']][] = $game;
        }

        if ($requestedNames !== []) {
            $requestedNameRows = implode(' UNION ALL ', array_fill(0, count($requestedNames), 'SELECT ? AS requested_name'));
            $lookup = $this->prepare(
                'SELECT requested.requested_name, matched.id_jogo
                 FROM (' . $requestedNameRows . ') requested
                 INNER JOIN jogos matched
                   ON matched.modalidades_id_modalidade = ?
                  AND matched.nome_jogo = requested.requested_name
                 ORDER BY requested.requested_name, matched.id_jogo
                 FOR UPDATE',
            );
            $lookupTypes = str_repeat('s', count($requestedNames)) . 'i';
            $lookupParams = [...$requestedNames, $modalityId];
            $lookup->bind_param($lookupTypes, ...$lookupParams);
            $lookup->execute();
            $matches = $lookup->get_result()->fetch_all(MYSQLI_ASSOC);
            $lookup->close();

            $byRequestedName = [];
            foreach ($matches as $match) {
                $requestedName = (string) $match['requested_name'];
                $gameId = (int) $match['id_jogo'];
                if (isset($gamesById[$gameId])) {
                    $byRequestedName[$requestedName][] = $gamesById[$gameId];
                }
            }
            foreach ($requestedNames as $requestedName) {
                $byName[$requestedName] = $byRequestedName[$requestedName] ?? [];
            }
        }

        return $byName;
    }

    /**
     * @param array<string,list<array{id:int,name:string,status:string,requires_link:bool,parts:list<array{team_id:int,score:int,part_id:int}>,duplicate_participants:bool}>> $snapshot
     * @return array<string,array{name:string,status:string,meta:array{largura:int,slot:int,kind:string,posicao?:int}|null,parts:list<array{team_id:int,score:int,part_id:int}>}>
     */
    private function projectSyncGames(array $snapshot): array
    {
        $projected = [];
        foreach ($snapshot as $name => $matches) {
            if (count($matches) !== 1) {
                continue;
            }
            $game = $matches[0];
            $meta = ChaveamentoRules::parse($name);
            $projected[$name] = [
                'name' => $name,
                'status' => $this->normalizeSyncStatus($game['status']),
                'meta' => $meta,
                'parts' => $game['parts'],
            ];
        }
        return $projected;
    }

    /**
     * @param array<string,mixed> $game
     * @param list<int> $requestedTeamIds
     * @param list<int> $existingTeamIds
     * @param array<string,array{name:string,status:string,meta:array{largura:int,slot:int,kind:string,posicao?:int}|null,parts:list<array{team_id:int,score:int,part_id:int}>}> $projected
     * @param array<string,list<array{id:int,name:string,status:string,requires_link:bool,parts:list<array{team_id:int,score:int,part_id:int}>,duplicate_participants:bool}>> $snapshot
     */
    private function validateStructuralParticipants(array $game, array $requestedTeamIds, array $existingTeamIds, array $projected, array $snapshot): void
    {
        $meta = $game['meta'];
        if ($meta['kind'] === 'B') {
            if (count($requestedTeamIds) !== 1 || ($existingTeamIds !== [] && $existingTeamIds !== $requestedTeamIds)) {
                throw new \InvalidArgumentException('Um bye precisa preservar exatamente uma equipe.');
            }
            if (!ChaveamentoRules::jogoEstaEncerrado($game['status_jogo'])) {
                throw new \InvalidArgumentException('Um bye precisa permanecer concluído.');
            }
            if ($game['partidas'][0]['resultado'] !== 0) {
                throw new \InvalidArgumentException('Um bye não pode possuir placar.');
            }
            return;
        }

        if (isset($meta['posicao'])) {
            if (count($requestedTeamIds) !== 2) {
                throw new \InvalidArgumentException('A disputa de terceiro lugar precisa de duas equipes.');
            }
            $semifinals = [];
            $hasSemifinals = false;
            foreach ([0, 1] as $slot) {
                $semi = $this->projectedStructuralSlot(4, $slot, $projected, $snapshot);
                if ($semi === null) {
                    continue;
                }
                $hasSemifinals = true;
                $loser = $this->matchLoser($semi);
                if ($loser !== null) {
                    $semifinals[] = $loser;
                }
            }
            if ($hasSemifinals) {
                $expected = $this->sortedUniqueIds($semifinals);
                if (count($expected) !== 2 || $expected !== $requestedTeamIds) {
                    throw new \InvalidArgumentException('A disputa de terceiro lugar deve conter os perdedores das semifinais.');
                }
            } elseif ($existingTeamIds !== [] && $existingTeamIds !== $requestedTeamIds) {
                throw new \InvalidArgumentException('A disputa de terceiro lugar não pode substituir as equipes persistidas.');
            }
            return;
        }

        if (count($requestedTeamIds) === 0 || count($requestedTeamIds) > 2) {
            throw new \InvalidArgumentException('A partida mata-mata precisa ter uma ou duas equipes.');
        }
        $left = $this->projectedStructuralSlot($meta['largura'] * 2, $meta['slot'] * 2, $projected, $snapshot);
        $right = $this->projectedStructuralSlot($meta['largura'] * 2, $meta['slot'] * 2 + 1, $projected, $snapshot);
        $hasChildren = $left !== null || $right !== null;
        if ($hasChildren) {
            $expected = [];
            foreach ([$left, $right] as $child) {
                if ($child === null) {
                    continue;
                }
                $winner = $this->matchWinner($child);
                if ($winner !== null) {
                    $expected[] = $winner;
                }
            }
            $expected = $this->sortedUniqueIds($expected);
            if ($expected !== []) {
                if ($expected !== $requestedTeamIds) {
                    throw new \InvalidArgumentException('As equipes do jogo devem ser os vencedores dos confrontos anteriores.');
                }
            } elseif ($existingTeamIds === [] || $existingTeamIds !== $requestedTeamIds) {
                throw new \InvalidArgumentException('O jogo ainda não possui vencedores de confrontos anteriores.');
            }
        } elseif ($existingTeamIds !== []) {
            if ($existingTeamIds !== $requestedTeamIds) {
                throw new \InvalidArgumentException('A sincronização não pode substituir as equipes já vinculadas ao confronto.');
            }
        } elseif (count($requestedTeamIds) !== 2) {
            throw new \InvalidArgumentException('Uma partida normal precisa de duas equipes, salvo avanço por bye.');
        }
    }

    /**
     * @param array<string,array{name:string,status:string,meta:array{largura:int,slot:int,kind:string,posicao?:int}|null,parts:list<array{team_id:int,score:int,part_id:int}>}> $projected
     * @param array<string,list<array{id:int,name:string,status:string,requires_link:bool,parts:list<array{team_id:int,score:int,part_id:int}>,duplicate_participants:bool}>> $snapshot
     * @return array{name:string,status:string,meta:array{largura:int,slot:int,kind:string,posicao?:int}|null,parts:list<array{team_id:int,score:int,part_id:int}>}|null
     */
    private function projectedStructuralSlot(int $width, int $slot, array $projected, array $snapshot): ?array
    {
        $found = null;
        foreach (['N', 'B'] as $kind) {
            $name = ChaveamentoRules::tag($width, $slot, $kind);
            if (count($snapshot[$name] ?? []) > 1) {
                throw new \InvalidArgumentException('Uma tag de confronto anterior está ambígua.');
            }
            if (!isset($projected[$name])) {
                continue;
            }
            if ($found !== null) {
                throw new \InvalidArgumentException('Há mais de um jogo estrutural para o mesmo slot.');
            }
            $found = $projected[$name];
        }
        return $found;
    }

    /** @param array{name:string,status:string,meta:array{largura:int,slot:int,kind:string,posicao?:int}|null,parts:list<array{team_id:int,score:int,part_id:int}>} $game */
    private function matchWinner(array $game): ?int
    {
        if (!ChaveamentoRules::jogoEstaEncerrado($game['status'])) {
            return null;
        }
        $meta = $game['meta'];
        $parts = $game['parts'];
        if ($meta === null || $meta['kind'] === 'B') {
            return count($parts) === 1 ? $parts[0]['team_id'] : null;
        }
        if (count($parts) === 1) {
            return $parts[0]['team_id'];
        }
        if (count($parts) !== 2) {
            throw new \InvalidArgumentException('Um confronto concluído precisa ter duas equipes ou um bye válido.');
        }
        (new PlacarService())->validarFinalizacao(array_column($parts, 'score'));
        return ChaveamentoRules::vencedorDePartidas(array_map(static fn (array $part): array => [
            'equipes_id_equipe' => $part['team_id'],
            'resultado_partida' => $part['score'],
        ], $parts));
    }

    /** @param array{name:string,status:string,meta:array{largura:int,slot:int,kind:string,posicao?:int}|null,parts:list<array{team_id:int,score:int,part_id:int}>} $game */
    private function matchLoser(array $game): ?int
    {
        if (!ChaveamentoRules::jogoEstaEncerrado($game['status'])) {
            return null;
        }
        $meta = $game['meta'];
        $parts = $game['parts'];
        if ($meta === null || $meta['kind'] === 'B' || count($parts) !== 2) {
            return null;
        }
        (new PlacarService())->validarFinalizacao(array_column($parts, 'score'));
        return ChaveamentoRules::perdedorDePartidas(array_map(static fn (array $part): array => [
            'equipes_id_equipe' => $part['team_id'],
            'resultado_partida' => $part['score'],
        ], $parts));
    }

    /** @param list<int> $ids @return list<int> */
    private function sortedUniqueIds(array $ids): array
    {
        $ids = array_values(array_unique($ids));
        sort($ids, SORT_NUMERIC);
        return $ids;
    }

    /**
     * @param list<array{nome_jogo:string,status_jogo:string,existing_id:?int,existing_parts:list<array{team_id:int,score:int,part_id:int}>,meta:array{largura:int,slot:int,kind:string,posicao?:int}|null,partidas:list<array{id_equipe:int,resultado:int}>}> $games
     * @param array<string,list<array{id:int,name:string,status:string,requires_link:bool,parts:list<array{team_id:int,score:int,part_id:int}>,duplicate_participants:bool}>> $snapshot
     * @param array<string,array{name:string,status:string,meta:array{largura:int,slot:int,kind:string,posicao?:int}|null,parts:list<array{team_id:int,score:int,part_id:int}>}> $projected
     */
    private function detectDownstreamRebuild(array $games, array $snapshot, array $projected): ?int
    {
        $requestedNames = [];
        foreach ($games as $game) {
            $requestedNames[$game['nome_jogo']] = true;
        }

        $rebuildFrom = null;
        foreach ($games as $game) {
            $meta = $game['meta'];
            if ($meta === null || isset($meta['posicao']) || $meta['largura'] <= 2) {
                continue;
            }
            $current = $snapshot[$game['nome_jogo']][0] ?? null;
            $currentParts = $current['parts'] ?? [];
            $currentStatus = $current === null ? null : $this->normalizeSyncStatus($current['status']);
            $newParts = array_map(static fn (array $part): array => [
                'team_id' => $part['id_equipe'],
                'score' => $part['resultado'],
            ], $game['partidas']);
            $oldParts = array_map(static fn (array $part): array => [
                'team_id' => $part['team_id'],
                'score' => $part['score'],
            ], $currentParts);
            usort($newParts, static fn (array $a, array $b): int => $a['team_id'] <=> $b['team_id']);
            usort($oldParts, static fn (array $a, array $b): int => $a['team_id'] <=> $b['team_id']);
            if ($current !== null && $currentStatus === $game['status_jogo'] && $oldParts === $newParts) {
                continue;
            }

            $parentName = ChaveamentoRules::tag(intdiv($meta['largura'], 2), intdiv($meta['slot'], 2), 'N');
            $parents = $snapshot[$parentName] ?? [];
            if (count($parents) > 1) {
                throw new \InvalidArgumentException('A tag do jogo seguinte está ambígua.');
            }
            if ($parents === [] || $parents[0]['parts'] === [] || isset($requestedNames[$parentName])) {
                continue;
            }

            $parentMeta = ChaveamentoRules::parse($parentName);
            if ($parentMeta === null) {
                continue;
            }
            $left = $this->projectedStructuralSlot($parentMeta['largura'] * 2, $parentMeta['slot'] * 2, $projected, $snapshot);
            $right = $this->projectedStructuralSlot($parentMeta['largura'] * 2, $parentMeta['slot'] * 2 + 1, $projected, $snapshot);
            $expected = [];
            foreach ([$left, $right] as $child) {
                if ($child !== null) {
                    $winner = $this->matchWinner($child);
                    if ($winner !== null) {
                        $expected[] = $winner;
                    }
                }
            }
            $expected = $this->sortedUniqueIds($expected);
            $existingParentTeams = $this->sortedUniqueIds(array_column($parents[0]['parts'], 'team_id'));
            if ($expected === [] || $expected === $existingParentTeams) {
                continue;
            }

            foreach ($games as $candidate) {
                $candidateMeta = $candidate['meta'];
                if ($candidateMeta === null) {
                    continue;
                }
                if (isset($candidateMeta['posicao']) || $candidateMeta['largura'] < $meta['largura']) {
                    throw new \InvalidArgumentException('O lote contém jogos descendentes desatualizados; sincronize novamente após reconstruir a chave.');
                }
            }
            $rebuildFrom = $rebuildFrom === null ? $meta['largura'] : min($rebuildFrom, $meta['largura']);
        }
        return $rebuildFrom;
    }

    private function validateLinkedScore(?int $partId, int $score): void
    {
        $active = 0;
        if ($partId !== null && $partId > 0) {
            $statement = $this->prepare("SELECT id_artilheiro FROM artilheiros WHERE partidas_id_partida = ? AND status_artilheiro = 'ativo' AND conta_no_placar = 1 FOR UPDATE");
            $statement->bind_param('i', $partId);
            $statement->execute();
            $active = $statement->get_result()->num_rows;
            $statement->close();
        }
        if ($active !== $score) {
            throw new \InvalidArgumentException('O placar sincronizado precisa possuir um ponto vinculado a cada gol.');
        }
    }

    /** @param list<int> $teamIds */
    private function validateTeamsForModality(int $modalityId, array $teamIds): void
    {
        $placeholders = implode(',', array_fill(0, count($teamIds), '?'));
        $types = 'i' . str_repeat('i', count($teamIds));
        $params = array_merge([$modalityId], $teamIds);
        $statement = $this->prepare(
            'SELECT id_equipe FROM equipes
             WHERE modalidades_id_modalidade = ?
               AND id_equipe IN (' . $placeholders . ')
             FOR UPDATE',
        );
        $statement->bind_param($types, ...$params);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível validar as equipes da sincronização.');
        }
        $rows = $statement->get_result()->fetch_all(MYSQLI_ASSOC);
        $statement->close();
        if (count($rows) !== count($teamIds)) {
            throw new \InvalidArgumentException('Todas as equipes devem pertencer à modalidade sincronizada.');
        }
    }

    /** @param list<int> $params @return array<string, mixed>|null */
    private function one(string $sql, string $types, array $params): ?array
    {
        $statement = $this->prepare($sql);
        $statement->bind_param($types, ...$params);
        $statement->execute();
        $row = $statement->get_result()->fetch_assoc() ?: null;
        $statement->close();
        return $row;
    }

    private function prepare(string $sql): \mysqli_stmt
    {
        $statement = $this->connection->prepare($sql);
        if ($statement === false) {
            throw new RuntimeException('Não foi possível preparar sincronização.');
        }
        return $statement;
    }

    private function validarPontuacaoSincronizada(int $gameId, int $teamId, int $score): void
    {
        if ($score < 0) {
            throw new \InvalidArgumentException('O resultado da partida não pode ser negativo.');
        }
        $pontos = new MysqliPontoRepository($this->connection);
        if (!$pontos->exigeVinculo($gameId)) {
            return;
        }
        $partida = $this->one('SELECT id_partida FROM partidas WHERE jogos_id_jogo = ? AND equipes_id_equipe = ? LIMIT 1', 'ii', [$gameId, $teamId]);
        $ativos = 0;
        if ($partida !== null) {
            $row = $this->one("SELECT COUNT(*) AS total FROM artilheiros WHERE partidas_id_partida = ? AND status_artilheiro = 'ativo' AND conta_no_placar = 1", 'i', [(int) $partida['id_partida']]);
            $ativos = (int) ($row['total'] ?? 0);
        }
        if ($ativos !== $score) {
            throw new \InvalidArgumentException('O placar sincronizado precisa possuir um ponto vinculado a cada gol.');
        }
    }
}
