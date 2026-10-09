<?php

declare(strict_types=1);

namespace App\Modules\Competicoes\Infrastructure;

use App\Modules\Competicoes\Application\AgendamentoBlocoScheduler;
use App\Modules\Competicoes\Application\AgendamentoSequencialScheduler;
use App\Modules\Competicoes\Application\AgendaRevisaoException;
use App\Modules\Competicoes\Domain\TipoCompeticaoRules;
use InvalidArgumentException;
use mysqli;
use RuntimeException;

final class MysqliAgendamentoBlocoRepository
{
    private ?bool $planningAvailable = null;

    public function __construct(
        private readonly mysqli $connection,
        private readonly AgendamentoBlocoScheduler $scheduler = new AgendamentoBlocoScheduler(),
        private readonly AgendamentoSequencialScheduler $sequentialScheduler = new AgendamentoSequencialScheduler(),
    ) {
    }

    /** @return array{edicao:int,resultado:array<string,mixed>} */
    public function simulate(array $payload, int $edition): array
    {
        $this->assertUnpublishedCalendar($edition);
        $this->validateWindows($payload, $edition);
        $selected = $this->selectedMatches($payload, $edition);
        if ($selected === []) {
            throw new InvalidArgumentException('Selecione ao menos um confronto para agendar.');
        }
        $keys = array_fill_keys(array_map(static fn (array $match): string => (string) $match['id_modalidade'] . ':' . (string) $match['chave_tag'], $selected), true);
        $fixed = $this->fixedReservations($edition, $keys);
        $result = $this->scheduler->simulate(
            $selected,
            (array) ($payload['janelas'] ?? []),
            $fixed,
            (array) ($payload['opcoes'] ?? $payload),
        );
        $result['revisao'] = $this->revision($edition);
        return ['edicao' => $edition, 'resultado' => $result];
    }

    /**
     * Simula a agenda completa da modalidade, incluindo posições futuras da
     * chave. As reservas futuras permitem que o mesário avance a chave sem
     * depender de uma nova intervenção do administrador.
     *
     * @return array{edicao:int,resultado:array<string,mixed>}
     */
    public function simulateSequential(array $payload, int $edition): array
    {
        $this->assertUnpublishedCalendar($edition);
        $modality = (int) ($payload['id_modalidade'] ?? 0);
        if ($modality <= 0) {
            throw new InvalidArgumentException('Informe a modalidade para o agendamento sequencial.');
        }
        $this->assertSequentialModality($modality, $edition);
        $this->validateWindows($payload, $edition, true);
        $selected = $this->selectedSequentialMatches($payload, $edition, $modality);
        if ($selected === []) {
            throw new InvalidArgumentException('Não há jogos pendentes de agendamento nesta modalidade.');
        }
        $keys = array_fill_keys(array_map(static fn (array $match): string => (string) $match['id_modalidade'] . ':' . (string) $match['chave_tag'], $selected), true);
        $fixed = $this->fixedReservations($edition, $keys);
        $result = $this->sequentialScheduler->simulate(
            $selected,
            (array) ($payload['dias'] ?? []),
            $fixed,
            (array) ($payload['opcoes'] ?? $payload),
        );
        $result['revisao'] = $this->revision($edition);
        return ['edicao' => $edition, 'resultado' => $result];
    }

    /** @return list<array<string,mixed>> */
    public function listReservations(int $edition, ?int $modality = null): array
    {
        $sql = "SELECT ar.id_reserva, ar.id_interclasse, ar.id_modalidade, ar.chave_versao,
                       ar.chave_tag, ar.id_jogo, DATE_FORMAT(ar.data_reserva, '%Y-%m-%d') AS data_reserva,
                       TIME_FORMAT(ar.inicio_reserva, '%H:%i:%s') AS inicio_reserva,
                       TIME_FORMAT(ar.termino_reserva, '%H:%i:%s') AS termino_reserva,
                       ar.id_local, l.nome_local, ar.intervalo_troca_min, ar.descanso_min,
                       TIME_TO_SEC(TIMEDIFF(ar.termino_reserva, ar.inicio_reserva)) AS duracao_segundos
                FROM agenda_reservas ar
                LEFT JOIN locais l ON l.id_local = ar.id_local
                WHERE ar.id_interclasse = ?
                  AND ar.id_bloco IS NOT NULL
                  AND ar.data_reserva IS NOT NULL
                  AND ar.inicio_reserva IS NOT NULL
                  AND ar.termino_reserva IS NOT NULL
                  AND ar.id_local IS NOT NULL
                  AND ar.chave_tag <> 'POS:3:0:N'";
        $types = 'i';
        $params = [$edition];
        if ($modality !== null) {
            $sql .= ' AND ar.id_modalidade = ?';
            $types .= 'i';
            $params[] = $modality;
        }
        $sql .= ' ORDER BY ar.data_reserva ASC, ar.inicio_reserva ASC, ar.id_modalidade ASC, ar.chave_tag ASC';

        $statement = $this->prepare($sql);
        $statement->bind_param($types, ...$params);
        $statement->execute();
        $rows = $statement->get_result()->fetch_all(MYSQLI_ASSOC);
        $statement->close();

        return $rows;
    }

    /** @return array<string,mixed> */
    public function confirm(array $payload, int $edition, int $userId): array
    {
        return $this->confirmInternal($payload, $edition, $userId, false);
    }

    /** @return array<string,mixed> */
    public function confirmSequential(array $payload, int $edition, int $userId): array
    {
        return $this->confirmInternal($payload, $edition, $userId, true);
    }

    /** @return array<string,mixed> */
    private function confirmInternal(array $payload, int $edition, int $userId, bool $sequential): array
    {
        $idempotency = trim((string) ($payload['idempotencia'] ?? ''));
        if ($idempotency === '') {
            $idempotency = hash('sha256', (string) json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        }
        if (strlen($idempotency) > 80) {
            throw new InvalidArgumentException('A identificação da confirmação é inválida.');
        }
        $payloadFingerprint = $this->fingerprint($payload);
        $this->connection->begin_transaction();
        try {
            $this->lockEdition($edition);
            $existing = $this->one('SELECT id_bloco, parametros_json FROM agenda_blocos WHERE id_interclasse = ? AND chave_idempotencia = ? LIMIT 1', 'is', [$edition, $idempotency]);
            if ($existing !== null) {
                if ($this->fingerprintFromJson((string) ($existing['parametros_json'] ?? '')) !== $payloadFingerprint) {
                    throw new InvalidArgumentException('A identificação já foi usada com parâmetros diferentes.');
                }
                $this->connection->commit();
                return ['success' => true, 'id_bloco' => (int) $existing['id_bloco'], 'idempotente' => true, 'message' => 'Este bloco já foi confirmado.'];
            }

            $simulation = ($sequential ? $this->simulateSequential($payload, $edition) : $this->simulate($payload, $edition))['resultado'];
            if ($simulation['pendencias'] !== []) {
                throw new InvalidArgumentException('O bloco possui confrontos sem horário. Ajuste a seleção ou as janelas antes de confirmar.');
            }
            $expectedRevision = isset($payload['revisao']) ? (int) $payload['revisao'] : null;
            if ($expectedRevision !== null && $expectedRevision !== $simulation['revisao']) {
                throw new AgendaRevisaoException('A programação mudou enquanto a prévia estava aberta. Gere uma nova prévia.');
            }

            $proposals = array_values((array) ($simulation['proposta'] ?? []));
            $proposalLocalIds = array_map(
                static fn (array $reservation): int => (int) ($reservation['locais_id_local'] ?? 0),
                $proposals,
            );
            MysqliLocalScheduleGuard::lockLocals($this->connection, $proposalLocalIds);
            $selectedGameIds = array_values(array_unique(array_filter(array_map(
                static fn (array $reservation): int => (int) ($reservation['id_jogo'] ?? 0),
                $proposals,
            ), static fn (int $gameId): bool => $gameId > 0)));
            foreach ($proposals as $reservation) {
                $conflict = MysqliLocalScheduleGuard::conflictWithGames(
                    $this->connection,
                    (string) $reservation['data_jogo'],
                    (int) $reservation['locais_id_local'],
                    (string) $reservation['inicio_jogo'],
                    (string) $reservation['termino_jogo'],
                    $selectedGameIds,
                    true,
                );
                if ($conflict !== null) {
                    throw new InvalidArgumentException($conflict);
                }
            }

            $paramsJson = (string) json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
            $block = $this->prepare('INSERT INTO agenda_blocos (id_interclasse, id_usuario, chave_idempotencia, parametros_json, revisao) VALUES (?, ?, ?, ?, ?)');
            $revision = (int) $simulation['revisao'] + 1;
            $block->bind_param('iissi', $edition, $userId, $idempotency, $paramsJson, $revision);
            $block->execute();
            $blockId = (int) $this->connection->insert_id;
            $block->close();

            foreach ($simulation['proposta'] as $reservation) {
                $this->saveReservation($reservation, $edition, $blockId, $userId);
            }
            $this->touchBlock($blockId);
            $this->connection->commit();
        } catch (\Throwable $exception) {
            $this->connection->rollback();
            throw $exception;
        }

        return [
            'success' => true,
            'id_bloco' => $blockId,
            'idempotente' => false,
            'programados' => count($simulation['proposta']),
            'message' => $sequential ? 'Agendamento sequencial confirmado com sucesso.' : 'Bloco de jogos confirmado com sucesso.',
        ];
    }

    /** @return list<array<string,mixed>> */
    private function selectedSequentialMatches(array $payload, int $edition, int $modality): array
    {
        $rows = $this->allGamesForModality($modality, $edition);
        $byTag = [];
        $maxWidth = 0;
        foreach ($rows as $row) {
            $tag = (string) ($row['nome_jogo'] ?? '');
            $byTag[$tag] = $row;
            if (preg_match('/^MM:(\d+):\d+:N$/', $tag, $parts) === 1) {
                $maxWidth = max($maxWidth, (int) $parts[1]);
            }
        }
        if ($maxWidth < 2) {
            throw new InvalidArgumentException('A modalidade ainda não possui uma chave Mata-Mata para agendar.');
        }

        $tags = [];
        for ($width = $maxWidth; $width >= 2; $width = intdiv($width, 2)) {
            for ($slot = 0; $slot < intdiv($width, 2); $slot++) {
                $tags[] = \App\Modules\Competicoes\Domain\ChaveamentoRules::tag($width, $slot, 'N');
            }
        }
        $scopePayload = $payload;
        $scopePayload['todos_jogos'] = true;
        $scopePayload['chave_tags'] = array_map(static fn (string $tag): array => [
            'id_modalidade' => $modality,
            'chave_tag' => $tag,
        ], $tags);

        $matches = [];
        foreach ($tags as $tag) {
            $row = $byTag[$tag] ?? null;
            if ($row !== null) {
                if ((string) ($row['status_jogo'] ?? '') !== 'Agendado') {
                    continue;
                }
                $complete = $this->hasCompleteSchedule($row);
                if ($complete && !filter_var($payload['reprogramar'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
                    continue;
                }
                $matches[] = $this->matchFromRow($row, $scopePayload);
                continue;
            }
            if ($this->reservationIsComplete($edition, $modality, $tag)
                && !filter_var($payload['reprogramar'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
                continue;
            }
            $matches[] = $this->matchFromTag($modality, $tag, $scopePayload);
        }
        return $this->uniqueMatches($matches);
    }

    /** @return list<array<string,mixed>> */
    private function allGamesForModality(int $modality, int $edition): array
    {
        $statement = $this->prepare('SELECT j.id_jogo, j.nome_jogo, j.data_jogo, j.inicio_jogo, j.termino_jogo, j.locais_id_local, j.status_jogo, j.modalidades_id_modalidade FROM jogos j INNER JOIN modalidades m ON m.id_modalidade = j.modalidades_id_modalidade WHERE j.modalidades_id_modalidade = ? AND m.interclasses_id_interclasse = ? ORDER BY j.id_jogo ASC');
        $statement->bind_param('ii', $modality, $edition);
        $statement->execute();
        $rows = $statement->get_result()->fetch_all(MYSQLI_ASSOC);
        $statement->close();
        return $rows;
    }

    /** @param array<string,mixed> $row */
    private function hasCompleteSchedule(array $row): bool
    {
        return trim((string) ($row['data_jogo'] ?? '')) !== ''
            && trim((string) ($row['inicio_jogo'] ?? '')) !== ''
            && trim((string) ($row['termino_jogo'] ?? '')) !== ''
            && (int) ($row['locais_id_local'] ?? 0) > 0;
    }

    private function reservationIsComplete(int $edition, int $modality, string $tag): bool
    {
        return $this->one('SELECT id_reserva FROM agenda_reservas WHERE id_interclasse = ? AND id_modalidade = ? AND chave_tag = ? AND data_reserva IS NOT NULL AND inicio_reserva IS NOT NULL AND termino_reserva IS NOT NULL AND id_local IS NOT NULL LIMIT 1', 'iis', [$edition, $modality, $tag]) !== null;
    }

    /** @return list<array<string,mixed>> */
    private function selectedMatches(array $payload, int $edition): array
    {
        $matches = [];
        $items = (array) ($payload['jogos'] ?? []);
        foreach ($items as $item) {
            $gameId = is_array($item) ? (int) ($item['id_jogo'] ?? 0) : (int) $item;
            $tag = is_array($item) ? trim((string) ($item['chave_tag'] ?? '')) : '';
            if ($gameId > 0) {
                $row = $this->game($gameId, $edition);
                if ($row === null) {
                    throw new InvalidArgumentException('Um dos jogos selecionados não pertence à edição informada.');
                }
                $matches[] = $this->matchFromRow($row, $payload);
            } elseif ($tag !== '') {
                $modality = (int) ($item['id_modalidade'] ?? $payload['id_modalidade'] ?? 0);
                if ($modality <= 0) {
                    throw new InvalidArgumentException('Informe a modalidade para uma posição futura da chave.');
                }
                $this->assertModalityBelongsToEdition($modality, $edition);
                $row = $this->gameByTag($modality, $tag, $edition);
                $matches[] = $row === null
                    ? $this->matchFromTag($modality, $tag, $payload)
                    : $this->matchFromRow($row, $payload);
            }
        }
        foreach ((array) ($payload['chave_tags'] ?? []) as $item) {
            $tag = is_array($item) ? trim((string) ($item['chave_tag'] ?? '')) : trim((string) $item);
            $modality = is_array($item) ? (int) ($item['id_modalidade'] ?? 0) : (int) ($payload['id_modalidade'] ?? 0);
            if ($tag === '' || $modality <= 0) {
                throw new InvalidArgumentException('Informe modalidade e posição para cada reserva futura.');
            }
            $this->assertModalityBelongsToEdition($modality, $edition);
            $row = $this->gameByTag($modality, $tag, $edition);
            $matches[] = $row === null ? $this->matchFromTag($modality, $tag, $payload) : $this->matchFromRow($row, $payload);
        }
        return $this->uniqueMatches($matches);
    }

    /** @param array<string,mixed> $row @param array<string,mixed> $payload @return array<string,mixed> */
    private function matchFromRow(array $row, array $payload): array
    {
        if ((string) ($row['status_jogo'] ?? '') !== 'Agendado') {
            throw new InvalidArgumentException('Somente jogos ainda não iniciados podem ser programados em bloco.');
        }
        $hasSchedule = trim((string) ($row['data_jogo'] ?? '')) !== ''
            && trim((string) ($row['inicio_jogo'] ?? '')) !== ''
            && trim((string) ($row['termino_jogo'] ?? '')) !== ''
            && (int) ($row['locais_id_local'] ?? 0) > 0;
        if ($hasSchedule && !filter_var($payload['reprogramar'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
            throw new InvalidArgumentException('O jogo ' . (string) $row['nome_jogo'] . ' já está agendado. Marque a opção de reprogramação para incluí-lo.');
        }
        $tag = (string) $row['nome_jogo'];
        $match = [
            'id_jogo' => (int) $row['id_jogo'],
            'chave_tag' => $tag,
            'nome_jogo' => $tag,
            'id_modalidade' => (int) $row['modalidades_id_modalidade'],
            'participantes' => $this->participants((int) $row['id_jogo']),
        ];
        return $this->withDependencies($match, $payload);
    }

    /** @return array<string,mixed> */
    private function matchFromTag(int $modality, string $tag, array $payload): array
    {
        return $this->withDependencies(['id_jogo' => null, 'chave_tag' => $tag, 'nome_jogo' => $tag, 'id_modalidade' => $modality, 'participantes' => []], $payload);
    }

    /** @param array<string,mixed> $match @return array<string,mixed> */
    private function withDependencies(array $match, array $payload): array
    {
        if ((string) ($match['chave_tag'] ?? '') === 'POS:3:0:N') {
            throw new InvalidArgumentException('O terceiro lugar é atribuído automaticamente e não possui partida para agendar.');
        }
        $dependencies = array_values(array_filter(
            $this->dependencies((string) $match['chave_tag']),
            fn (string $dependency): bool => $this->dependencyIsInScope((int) $match['id_modalidade'], $dependency, $payload),
        ));
        $match['dependencias'] = $dependencies;
        $terms = [];
        foreach ($dependencies as $dependency) {
            $known = $this->scheduledEnd((int) $match['id_modalidade'], $dependency);
            if ($known !== null) {
                $terms[$dependency] = $known;
            }
        }
        $match['dependencias_terminos'] = $terms;
        return $match;
    }

    private function dependencyIsInScope(int $modality, string $dependency, array $payload): bool
    {
        foreach ((array) ($payload['chave_tags'] ?? []) as $item) {
            $tag = is_array($item) ? trim((string) ($item['chave_tag'] ?? '')) : trim((string) $item);
            if ($tag === $dependency) {
                return true;
            }
        }
        foreach ((array) ($payload['jogos'] ?? []) as $item) {
            if (is_array($item) && trim((string) ($item['chave_tag'] ?? '')) === $dependency) {
                return true;
            }
        }
        if ($this->one('SELECT id_jogo FROM jogos WHERE modalidades_id_modalidade = ? AND nome_jogo IN (?, ?) LIMIT 1', 'iss', [$modality, $dependency, substr($dependency, 0, -2) . ':B']) !== null) {
            return true;
        }
        return $this->one('SELECT id_reserva FROM agenda_reservas WHERE id_modalidade = ? AND chave_tag = ? LIMIT 1', 'is', [$modality, $dependency]) !== null;
    }

    /** @return list<string> */
    private function dependencies(string $tag): array
    {
        if ($tag === 'POS:3:0:N') {
            return ['MM:4:0:N', 'MM:4:1:N'];
        }
        if (preg_match('/^MM:(\d+):(\d+):[NB]$/', $tag, $parts) !== 1) {
            return [];
        }
        $width = (int) $parts[1];
        $slot = (int) $parts[2];
        if ($width <= 1) {
            return [];
        }
        $childWidth = $width * 2;
        $childSlot = $slot * 2;
        return ["MM:{$childWidth}:{$childSlot}:N", "MM:{$childWidth}:" . ($childSlot + 1) . ':N'];
    }

    /** @return array{data:string,end:int}|null */
    private function scheduledEnd(int $modality, string $tag): ?array
    {
        $row = $this->one("SELECT DATE_FORMAT(data_jogo, '%Y-%m-%d') AS data, TIME_TO_SEC(termino_jogo) AS termino, status_jogo FROM jogos WHERE modalidades_id_modalidade = ? AND nome_jogo = ? LIMIT 1", 'is', [$modality, $tag]);
        if ($row !== null && $row['termino'] !== null) {
            return ['data' => (string) $row['data'], 'end' => intdiv((int) $row['termino'], 60)];
        }
        if ($row !== null && in_array((string) ($row['status_jogo'] ?? ''), ['Concluido', 'Finalizado'], true)) {
            // Byes and other automatically concluded positions do not have
            // an operational time, but they still resolve the dependency.
            return ['data' => '', 'end' => 0];
        }
        if ($row === null && str_ends_with($tag, ':N')) {
            $byeTag = substr($tag, 0, -2) . ':B';
            $row = $this->one("SELECT status_jogo FROM jogos WHERE modalidades_id_modalidade = ? AND nome_jogo = ? LIMIT 1", 'is', [$modality, $byeTag]);
            if ($row !== null && in_array((string) ($row['status_jogo'] ?? ''), ['Concluido', 'Finalizado'], true)) {
                return ['data' => '', 'end' => 0];
            }
        }
        $row = $this->one("SELECT DATE_FORMAT(data_reserva, '%Y-%m-%d') AS data, TIME_TO_SEC(termino_reserva) AS termino FROM agenda_reservas WHERE id_modalidade = ? AND chave_tag = ? AND data_reserva IS NOT NULL AND termino_reserva IS NOT NULL LIMIT 1", 'is', [$modality, $tag]);
        return $row === null || $row['termino'] === null
            ? null
            : ['data' => (string) $row['data'], 'end' => intdiv((int) $row['termino'], 60)];
    }

    /** @return list<string> */
    private function participants(int $gameId): array
    {
        $rows = $this->connection->query('SELECT equipes_id_equipe FROM partidas WHERE jogos_id_jogo = ' . $gameId)->fetch_all(MYSQLI_ASSOC);
        return array_map(static fn (array $row): string => 'equipe:' . (string) $row['equipes_id_equipe'], $rows);
    }

    /** @return array<string,mixed>|null */
    private function game(int $id, int $edition): ?array
    {
        return $this->one('SELECT j.id_jogo, j.nome_jogo, j.data_jogo, j.inicio_jogo, j.termino_jogo, j.locais_id_local, j.status_jogo, j.modalidades_id_modalidade FROM jogos j INNER JOIN modalidades m ON m.id_modalidade = j.modalidades_id_modalidade WHERE j.id_jogo = ? AND m.interclasses_id_interclasse = ? LIMIT 1', 'ii', [$id, $edition]);
    }

    /** @return array<string,mixed>|null */
    private function gameByTag(int $modality, string $tag, int $edition): ?array
    {
        return $this->one('SELECT j.id_jogo, j.nome_jogo, j.data_jogo, j.inicio_jogo, j.termino_jogo, j.locais_id_local, j.status_jogo, j.modalidades_id_modalidade FROM jogos j INNER JOIN modalidades m ON m.id_modalidade = j.modalidades_id_modalidade WHERE j.modalidades_id_modalidade = ? AND j.nome_jogo = ? AND m.interclasses_id_interclasse = ? LIMIT 1', 'isi', [$modality, $tag, $edition]);
    }

    /** @param array<string,bool> $selected */
    private function fixedReservations(int $edition, array $selected): array
    {
        $fixed = [];
        $rows = $this->connection->query("SELECT j.id_jogo, j.nome_jogo, j.modalidades_id_modalidade, j.data_jogo, j.inicio_jogo, j.termino_jogo, j.locais_id_local
            FROM jogos j INNER JOIN modalidades m ON m.id_modalidade = j.modalidades_id_modalidade
            WHERE m.interclasses_id_interclasse = " . $edition . " AND j.data_jogo IS NOT NULL AND j.inicio_jogo IS NOT NULL AND j.termino_jogo IS NOT NULL AND j.locais_id_local IS NOT NULL AND j.status_jogo IN ('Agendado','Iniciado','Pausado') AND j.nome_jogo <> 'POS:3:0:N'")->fetch_all(MYSQLI_ASSOC);
        foreach ($rows as $row) {
            $key = (string) $row['modalidades_id_modalidade'] . ':' . (string) $row['nome_jogo'];
            if (!isset($selected[$key])) {
                $row['participantes'] = $this->participants((int) $row['id_jogo']);
                $fixed[] = $row;
            }
        }
        $rows = $this->connection->query("SELECT ar.* FROM agenda_reservas ar WHERE ar.id_interclasse = {$edition} AND ar.chave_tag <> 'POS:3:0:N' AND ar.data_reserva IS NOT NULL AND ar.inicio_reserva IS NOT NULL AND ar.termino_reserva IS NOT NULL AND ar.id_local IS NOT NULL")->fetch_all(MYSQLI_ASSOC);
        foreach ($rows as $row) {
            $key = (string) $row['id_modalidade'] . ':' . (string) $row['chave_tag'];
            if (!isset($selected[$key])) {
                $fixed[] = $row;
            }
        }
        return $fixed;
    }

    /** @param array<string,mixed> $reservation */
    private function saveReservation(array $reservation, int $edition, int $blockId, int $userId): void
    {
        $modality = (int) ($reservation['id_modalidade'] ?? 0);
        $tag = (string) ($reservation['chave_tag'] ?? $reservation['nome_jogo'] ?? '');
        $version = (string) ($reservation['chave_versao'] ?? '1');
        $gameId = isset($reservation['id_jogo']) && (int) $reservation['id_jogo'] > 0 ? (int) $reservation['id_jogo'] : null;
        $date = (string) $reservation['data_jogo'];
        $start = (string) $reservation['inicio_jogo'];
        $end = (string) $reservation['termino_jogo'];
        $local = (int) $reservation['locais_id_local'];
        $duration = (int) ($reservation['duracao_jogo'] ?? 0);
        $changeover = (int) ($reservation['intervalo_troca_min'] ?? 0);
        $rest = (int) ($reservation['descanso_min'] ?? 0);
        $old = $this->one('SELECT id_reserva, data_reserva, inicio_reserva, termino_reserva, id_local FROM agenda_reservas WHERE id_interclasse = ? AND id_modalidade = ? AND chave_versao = ? AND chave_tag = ? LIMIT 1', 'iiss', [$edition, $modality, $version, $tag]);
        if ($gameId === null) {
            $statement = $this->prepare('INSERT INTO agenda_reservas (id_interclasse, id_modalidade, chave_versao, chave_tag, id_jogo, data_reserva, inicio_reserva, termino_reserva, id_local, intervalo_troca_min, descanso_min, id_bloco) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id_jogo = NULL, data_reserva = VALUES(data_reserva), inicio_reserva = VALUES(inicio_reserva), termino_reserva = VALUES(termino_reserva), id_local = VALUES(id_local), intervalo_troca_min = VALUES(intervalo_troca_min), descanso_min = VALUES(descanso_min), id_bloco = VALUES(id_bloco)');
            $statement->bind_param('iisssssiiii', $edition, $modality, $version, $tag, $date, $start, $end, $local, $changeover, $rest, $blockId);
        } else {
            $statement = $this->prepare('INSERT INTO agenda_reservas (id_interclasse, id_modalidade, chave_versao, chave_tag, id_jogo, data_reserva, inicio_reserva, termino_reserva, id_local, intervalo_troca_min, descanso_min, id_bloco) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id_jogo = VALUES(id_jogo), data_reserva = VALUES(data_reserva), inicio_reserva = VALUES(inicio_reserva), termino_reserva = VALUES(termino_reserva), id_local = VALUES(id_local), intervalo_troca_min = VALUES(intervalo_troca_min), descanso_min = VALUES(descanso_min), id_bloco = VALUES(id_bloco)');
            $statement->bind_param('iississsiiii', $edition, $modality, $version, $tag, $gameId, $date, $start, $end, $local, $changeover, $rest, $blockId);
        }
        $statement->execute();
        $statement->close();
        if ($gameId !== null) {
            $update = $this->prepare('UPDATE jogos SET data_jogo = ?, inicio_jogo = ?, termino_jogo = ?, locais_id_local = ?, duracao_jogo = ?, tempo_restante_jogo = COALESCE(tempo_restante_jogo, ?) WHERE id_jogo = ? AND status_jogo = \'Agendado\'');
            $update->bind_param('sssiiii', $date, $start, $end, $local, $duration, $duration, $gameId);
            $update->execute();
            $update->close();
        }
        $current = $this->one('SELECT id_reserva FROM agenda_reservas WHERE id_interclasse = ? AND id_modalidade = ? AND chave_versao = ? AND chave_tag = ? LIMIT 1', 'iiss', [$edition, $modality, $version, $tag]);
        $history = $this->prepare('INSERT INTO agenda_reservas_historico (id_reserva, id_bloco, id_usuario, operacao, anterior_json, novo_json) VALUES (?, ?, ?, ?, ?, ?)');
        $reservationId = $current === null ? null : (int) $current['id_reserva'];
        $operation = $old === null ? 'criar' : 'reprogramar';
        $oldJson = $old === null ? null : (string) json_encode($old, JSON_UNESCAPED_UNICODE);
        $newJson = (string) json_encode($reservation, JSON_UNESCAPED_UNICODE);
        $history->bind_param('iiisss', $reservationId, $blockId, $userId, $operation, $oldJson, $newJson);
        $history->execute();
        $history->close();
    }

    private function validateWindows(array $payload, int $edition, bool $sequential = false): void
    {
        $windows = $sequential ? (array) ($payload['dias'] ?? []) : (array) ($payload['janelas'] ?? []);
        $localIds = [];
        foreach ($windows as $window) {
            $windowLocals = $sequential
                ? [$window['local'] ?? $window['id_local'] ?? 0]
                : (array) ($window['locais'] ?? $window['locais_id_local'] ?? []);
            foreach ($windowLocals as $localId) {
                $local = (int) $localId;
                if ($local > 0) {
                    $localIds[$local] = true;
                }
            }
            if (!$sequential && isset($window['local']) && (int) $window['local'] > 0) {
                $localIds[(int) $window['local']] = true;
            }
        }
        foreach (array_keys($localIds) as $localId) {
            $row = $this->one("SELECT id_local FROM locais WHERE id_local = ? AND interclasses_id_interclasse = ? AND disponivel_local = '1' AND status_local = '1' LIMIT 1", 'ii', [(int) $localId, $edition]);
            if ($row === null) {
                throw new InvalidArgumentException('Um dos locais selecionados não pertence à edição ou está indisponível.');
            }
        }
    }

    private function assertModalityBelongsToEdition(int $modality, int $edition): void
    {
        if ($this->one('SELECT id_modalidade FROM modalidades WHERE id_modalidade = ? AND interclasses_id_interclasse = ? LIMIT 1', 'ii', [$modality, $edition]) === null) {
            throw new InvalidArgumentException('A modalidade selecionada não pertence à edição informada.');
        }
    }

    private function assertSequentialModality(int $modality, int $edition): void
    {
        $row = $this->one(
            'SELECT m.id_modalidade, tm.nome_tipo_modalidade
             FROM modalidades m
             LEFT JOIN tipos_modalidades tm ON tm.id_tipo_modalidade = m.tipos_modalidades_id_tipo_modalidade
             WHERE m.id_modalidade = ? AND m.interclasses_id_interclasse = ? LIMIT 1',
            'ii',
            [$modality, $edition],
        );
        if ($row === null) {
            throw new InvalidArgumentException('A modalidade selecionada não pertence à edição informada.');
        }
        if (TipoCompeticaoRules::resolve($row) !== TipoCompeticaoRules::MATA_MATA) {
            throw new InvalidArgumentException('O agendamento automático está disponível somente para modalidades Mata-Mata.');
        }
    }

    private function assertUnpublishedCalendar(int $edition): void
    {
        if (!$this->planningAvailable()) {
            return;
        }
        $planning = $this->one("SELECT id_interclasse FROM interclasse_planejamentos WHERE id_interclasse = ? AND cronograma_status = 'publicado' LIMIT 1", 'i', [$edition]);
        if ($planning !== null) {
            throw new InvalidArgumentException('O cronograma publicado já define os horários e confrontos desta edição.');
        }
    }

    private function planningAvailable(): bool
    {
        if ($this->planningAvailable !== null) {
            return $this->planningAvailable;
        }
        $result = $this->connection->query("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'interclasse_planejamentos' LIMIT 1");
        if ($result === false) {
            return $this->planningAvailable = false;
        }
        $exists = $result->num_rows > 0;
        $result->free();
        return $this->planningAvailable = $exists;
    }

    private function lockEdition(int $edition): void
    {
        if ($this->one('SELECT id_interclasse FROM interclasses WHERE id_interclasse = ? FOR UPDATE', 'i', [$edition]) === null) {
            throw new InvalidArgumentException('A edição informada não foi encontrada.');
        }
    }

    private function fingerprint(array $payload): string
    {
        return hash('sha256', $this->canonicalJson($payload));
    }

    private function fingerprintFromJson(string $json): string
    {
        $decoded = json_decode($json, true);
        return is_array($decoded) ? $this->fingerprint($decoded) : '';
    }

    private function canonicalJson(array $payload): string
    {
        $normalise = static function (mixed $value) use (&$normalise): mixed {
            if (!is_array($value)) {
                return $value;
            }
            if (array_is_list($value)) {
                return array_map($normalise, $value);
            }
            ksort($value);
            foreach ($value as $key => $item) {
                $value[$key] = $normalise($item);
            }
            return $value;
        };
        return (string) json_encode($normalise($payload), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    }

    private function touchBlock(int $blockId): void
    {
        $statement = $this->prepare('UPDATE agenda_blocos SET confirmado_em = CURRENT_TIMESTAMP WHERE id_bloco = ?');
        $statement->bind_param('i', $blockId);
        $statement->execute();
        $statement->close();
    }

    private function revision(int $edition): int
    {
        $row = $this->one('SELECT COALESCE(MAX(revisao), 0) AS revisao FROM agenda_blocos WHERE id_interclasse = ?', 'i', [$edition]);
        return (int) ($row['revisao'] ?? 0);
    }

    /** @param list<array<string,mixed>> $matches @return list<array<string,mixed>> */
    private function uniqueMatches(array $matches): array
    {
        $unique = [];
        foreach ($matches as $match) {
            $unique[(string) $match['id_modalidade'] . ':' . (string) $match['chave_tag']] = $match;
        }
        return array_values($unique);
    }

    /** @return array<string,mixed>|null */
    private function one(string $sql, string $types, array $params): ?array
    {
        $statement = $this->prepare($sql);
        if ($params !== []) {
            $statement->bind_param($types, ...$params);
        }
        $statement->execute();
        $row = $statement->get_result()->fetch_assoc() ?: null;
        $statement->close();
        return $row;
    }

    private function prepare(string $sql): \mysqli_stmt
    {
        $statement = $this->connection->prepare($sql);
        if ($statement === false) {
            throw new RuntimeException('Não foi possível preparar o agendamento em bloco.');
        }
        return $statement;
    }
}
