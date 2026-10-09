<?php

declare(strict_types=1);

namespace App\Modules\Competicoes\Infrastructure;

use App\Modules\Competicoes\Domain\JogoRepository;
use App\Shared\Database\Transaction;
use mysqli;
use RuntimeException;

final class MysqliJogoRepository implements JogoRepository
{
    private ?bool $planningAvailable = null;

    public function __construct(private readonly mysqli $connection)
    {
    }

    public function localConflict(string $date, int $localId, string $start, string $end, ?int $currentId = null): ?string
    {
        if ($start === '' || $end === '' || $start === '00:00:00' || $end === '00:00:00') {
            return null;
        }
        return MysqliLocalScheduleGuard::conflict($this->connection, $date, $localId, $start, $end, $currentId);
    }

    public function create(array $data): int
    {
        Transaction::begin($this->connection);
        try {
            $localId = (int) ($data['locais_id_local'] ?? 0);
            MysqliLocalScheduleGuard::lockLocals($this->connection, [$localId]);
            $modalityId = (int) ($data['modalidades_id_modalidade'] ?? 0);
            $modalityEditions = MysqliLocalScheduleGuard::lockModalities($this->connection, [$modalityId]);
            $editionId = $modalityEditions[$modalityId];
            MysqliLocalScheduleGuard::assertLocalBelongsToEdition($this->connection, $localId, $editionId);
            if ($this->planningAvailable()) {
                $planning = $this->connection->prepare('SELECT cronograma_status FROM interclasse_planejamentos WHERE id_interclasse = ? LIMIT 1 FOR UPDATE');
                $planning->bind_param('i', $editionId);
                $planning->execute();
                $planningStatus = $planning->get_result()->fetch_column();
                $planning->close();
                if ($planningStatus === 'publicado') {
                    throw new \InvalidArgumentException('O calendário publicado é a única fonte para criar os jogos desta edição.');
                }
            }
            $conflict = MysqliLocalScheduleGuard::conflict(
                $this->connection,
                (string) $data['data_jogo'],
                $localId,
                (string) $data['inicio_jogo'],
                (string) $data['termino_jogo'],
                lockRows: true,
            );
            if ($conflict !== null) {
                throw new \App\Modules\Competicoes\Application\JogoConflitoException($conflict);
            }
            $id = $this->insertGame($data);
            $teamIds = array_values(array_map('intval', is_array($data['equipes'] ?? null) ? $data['equipes'] : []));
            if ($teamIds !== []) {
                sort($teamIds, SORT_NUMERIC);
                $check = $this->connection->prepare(
                    "SELECT 1 FROM equipes
                     WHERE id_equipe = ? AND modalidades_id_modalidade = ? AND status_equipe = '1'
                     LIMIT 1 FOR UPDATE",
                );
                $partida = $this->connection->prepare(
                    'INSERT INTO partidas (jogos_id_jogo, equipes_id_equipe, resultado_partida, status_partida)
                     VALUES (?, ?, 0, \'1\')',
                );
                if ($check === false || $partida === false) {
                    if ($check !== false) {
                        $check->close();
                    }
                    if ($partida !== false) {
                        $partida->close();
                    }
                    throw new RuntimeException('Não foi possível criar os participantes do jogo.');
                }
                $modalityId = (int) $data['modalidades_id_modalidade'];
                $teamId = 0;
                $check->bind_param('ii', $teamId, $modalityId);
                $partida->bind_param('ii', $id, $teamId);
                foreach ($teamIds as $teamId) {
                    if (!$check->execute() || $check->get_result()->num_rows !== 1 || !$partida->execute()) {
                        $check->close();
                        $partida->close();
                        throw new RuntimeException('As equipes do jogo não pertencem à modalidade informada.');
                    }
                }
                $check->close();
                $partida->close();
            }
            Transaction::commit($this->connection);
            return $id;
        } catch (\Throwable $exception) {
            Transaction::rollback($this->connection);
            throw $exception;
        }
    }

    /** @param array<string, mixed> $data */
    private function insertGame(array $data): int
    {
        $statement = $this->connection->prepare(
            'INSERT INTO jogos (nome_jogo, data_jogo, inicio_jogo, termino_jogo,
                modalidades_id_modalidade, locais_id_local, status_jogo)
             VALUES (?, ?, ?, ?, ?, ?, ?)',
        );
        if ($statement === false) {
            throw new RuntimeException('Não foi possível criar jogo.');
        }
        $name = (string) $data['nome_jogo'];
        $date = (string) $data['data_jogo'];
        $start = (string) $data['inicio_jogo'];
        $end = (string) $data['termino_jogo'];
        $modalityId = (int) $data['modalidades_id_modalidade'];
        $localId = (int) $data['locais_id_local'];
        $status = (string) $data['status_jogo'];
        $statement->bind_param('ssssiis', $name, $date, $start, $end, $modalityId, $localId, $status);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível criar jogo.');
        }
        $id = (int) $this->connection->insert_id;
        $statement->close();
        return $id;
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
}
