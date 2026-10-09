<?php

declare(strict_types=1);

namespace App\Modules\Competicoes\Infrastructure;

use InvalidArgumentException;
use mysqli;
use RuntimeException;

/** Serializes changes to a venue schedule and performs fresh conflict reads. */
final class MysqliLocalScheduleGuard
{
    /** @param list<int> $localIds */
    public static function lockLocals(mysqli $connection, array $localIds): void
    {
        $localIds = array_values(array_unique(array_filter(array_map('intval', $localIds), static fn (int $id): bool => $id > 0)));
        sort($localIds, SORT_NUMERIC);
        $statement = $connection->prepare('SELECT id_local FROM locais WHERE id_local = ? LIMIT 1 FOR UPDATE');
        if ($statement === false) {
            throw new RuntimeException('Não foi possível bloquear os locais da agenda.');
        }
        foreach ($localIds as $localId) {
            $statement->bind_param('i', $localId);
            if (!$statement->execute()) {
                $statement->close();
                throw new RuntimeException('Não foi possível bloquear os locais da agenda.');
            }
            if ($statement->get_result()->num_rows !== 1) {
                $statement->close();
                throw new InvalidArgumentException('O local informado não foi encontrado.');
            }
        }
        $statement->close();
    }

    /** @param list<int> $modalityIds @return array<int, int> modality id to edition id */
    public static function lockModalities(mysqli $connection, array $modalityIds): array
    {
        $modalityIds = array_values(array_unique(array_filter(array_map('intval', $modalityIds), static fn (int $id): bool => $id > 0)));
        sort($modalityIds, SORT_NUMERIC);
        $statement = $connection->prepare('SELECT interclasses_id_interclasse FROM modalidades WHERE id_modalidade = ? LIMIT 1 FOR UPDATE');
        if ($statement === false) {
            throw new RuntimeException('Não foi possível bloquear a modalidade do jogo.');
        }
        $editions = [];
        foreach ($modalityIds as $modalityId) {
            $statement->bind_param('i', $modalityId);
            if (!$statement->execute()) {
                $statement->close();
                throw new RuntimeException('Não foi possível bloquear a modalidade do jogo.');
            }
            $editionId = $statement->get_result()->fetch_column();
            if ($editionId === null) {
                $statement->close();
                throw new InvalidArgumentException('A modalidade informada não foi encontrada.');
            }
            $editions[$modalityId] = (int) $editionId;
        }
        $statement->close();
        return $editions;
    }

    public static function assertLocalBelongsToEdition(mysqli $connection, int $localId, int $editionId): void
    {
        $statement = $connection->prepare('SELECT interclasses_id_interclasse, status_local, disponivel_local FROM locais WHERE id_local = ? LIMIT 1 FOR UPDATE');
        if ($statement === false) {
            throw new RuntimeException('Não foi possível validar o local do jogo.');
        }
        $statement->bind_param('i', $localId);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível validar o local do jogo.');
        }
        $local = $statement->get_result()->fetch_assoc() ?: null;
        $statement->close();
        if ($local === null) {
            throw new InvalidArgumentException('O local informado não foi encontrado.');
        }
        if ((int) $local['interclasses_id_interclasse'] !== $editionId) {
            throw new InvalidArgumentException('O local e a modalidade devem pertencer à mesma edição.');
        }
        if ((string) $local['status_local'] !== '1' || (string) $local['disponivel_local'] !== '1') {
            throw new InvalidArgumentException('O local informado está inativo ou indisponível.');
        }
    }

    public static function conflict(
        mysqli $connection,
        string $date,
        int $localId,
        string $start,
        string $end,
        ?int $currentGameId = null,
        bool $lockRows = false,
        ?int $excludedReservationId = null,
    ): ?string {
        $gameConflict = self::conflictWithGames(
            $connection,
            $date,
            $localId,
            $start,
            $end,
            $currentGameId === null ? [] : [$currentGameId],
            $lockRows,
        );
        if ($gameConflict !== null) {
            return $gameConflict;
        }

        $sql = "SELECT chave_tag FROM agenda_reservas
                WHERE data_reserva = ? AND id_local = ?
                  AND ? < ADDTIME(termino_reserva, '00:10:00')
                  AND ADDTIME(?, '00:10:00') > inicio_reserva";
        $types = 'siss';
        $params = [$date, $localId, $start, $end];
        if ($currentGameId !== null && $currentGameId > 0) {
            $sql .= ' AND (id_jogo IS NULL OR id_jogo <> ?)';
            $types .= 'i';
            $params[] = $currentGameId;
        }
        if ($excludedReservationId !== null && $excludedReservationId > 0) {
            $sql .= ' AND id_reserva <> ?';
            $types .= 'i';
            $params[] = $excludedReservationId;
        }
        $sql .= ' LIMIT 1' . ($lockRows ? ' FOR UPDATE' : '');
        $statement = $connection->prepare($sql);
        if ($statement === false) {
            throw new RuntimeException('Não foi possível validar conflitos das reservas de agenda.');
        }
        $statement->bind_param($types, ...$params);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível validar conflitos das reservas de agenda.');
        }
        $row = $statement->get_result()->fetch_assoc() ?: null;
        $statement->close();
        if ($row === null) {
            return self::conflictWithPublishedPlan($connection, $date, $localId, $start, $end, $lockRows);
        }

        return 'Já existe uma reserva neste mesmo local com conflito de horário (' . (string) $row['chave_tag'] . ').';
    }

    private static function conflictWithPublishedPlan(
        mysqli $connection,
        string $date,
        int $localId,
        string $start,
        string $end,
        bool $lockRows,
    ): ?string {
        $table = $connection->query("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'cronograma_compromissos' LIMIT 1");
        if ($table === false || $table->num_rows === 0) {
            if ($table !== false) {
                $table->free();
            }
            return null;
        }
        $table->free();
        $sql = "SELECT cc.chave_tag FROM cronograma_compromissos cc
                INNER JOIN interclasse_planejamentos ip
                    ON ip.id_interclasse = cc.id_interclasse
                   AND ip.versao_publicada = cc.cronograma_versao
                   AND ip.cronograma_status = 'publicado'
                WHERE cc.data_compromisso = ? AND cc.id_local = ?
                  AND ? < ADDTIME(cc.termino_compromisso, '00:10:00')
                  AND ADDTIME(?, '00:10:00') > cc.inicio_compromisso
                LIMIT 1" . ($lockRows ? ' FOR UPDATE' : '');
        $statement = $connection->prepare($sql);
        if ($statement === false) {
            throw new RuntimeException('Não foi possível validar conflitos do cronograma publicado.');
        }
        $statement->bind_param('siss', $date, $localId, $start, $end);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível validar conflitos do cronograma publicado.');
        }
        $row = $statement->get_result()->fetch_assoc() ?: null;
        $statement->close();
        return $row === null
            ? null
            : 'Já existe um compromisso publicado neste mesmo local com conflito de horário (' . (string) $row['chave_tag'] . ').';
    }

    /** @param list<int> $excludedGameIds */
    public static function conflictWithGames(
        mysqli $connection,
        string $date,
        int $localId,
        string $start,
        string $end,
        array $excludedGameIds = [],
        bool $lockRows = false,
    ): ?string {
        $sql = "SELECT nome_jogo FROM jogos
                WHERE data_jogo = ? AND locais_id_local = ?
                  AND status_jogo IN ('Agendado', 'Iniciado', 'Pausado')
                  AND ? < ADDTIME(termino_jogo, '00:10:00')
                  AND ADDTIME(?, '00:10:00') > inicio_jogo";
        $types = 'siss';
        $params = [$date, $localId, $start, $end];
        $excludedGameIds = array_values(array_unique(array_filter(array_map('intval', $excludedGameIds), static fn (int $id): bool => $id > 0)));
        if ($excludedGameIds !== []) {
            $sql .= ' AND id_jogo NOT IN (' . implode(', ', array_fill(0, count($excludedGameIds), '?')) . ')';
            $types .= str_repeat('i', count($excludedGameIds));
            array_push($params, ...$excludedGameIds);
        }
        $sql .= ' LIMIT 1' . ($lockRows ? ' FOR UPDATE' : '');
        $statement = $connection->prepare($sql);
        if ($statement === false) {
            throw new RuntimeException('Não foi possível validar conflitos de jogos.');
        }
        $statement->bind_param($types, ...$params);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível validar conflitos de jogos.');
        }
        $row = $statement->get_result()->fetch_assoc() ?: null;
        $statement->close();
        return $row === null
            ? null
            : 'Já existe um jogo agendado neste mesmo local com conflito de horário (' . (string) $row['nome_jogo'] . ').';
    }
}
