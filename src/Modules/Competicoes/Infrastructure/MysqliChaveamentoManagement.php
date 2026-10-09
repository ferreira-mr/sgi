<?php

declare(strict_types=1);

namespace App\Modules\Competicoes\Infrastructure;

use App\Modules\Competicoes\Domain\ChaveamentoManagement;
use App\Modules\Competicoes\Application\IndividualRankingService;
use App\Shared\Application\TransactionRunner;
use App\Shared\Database\MysqliTransactionRunner;
use mysqli;

final class MysqliChaveamentoManagement implements ChaveamentoManagement
{
    private readonly TransactionRunner $transactions;
    private readonly IndividualRankingService $individual;

    public function __construct(
        private readonly mysqli $connection,
        ?TransactionRunner $transactions = null,
        ?IndividualRankingService $individual = null,
    ) {
        $this->transactions = $transactions ?? new MysqliTransactionRunner($connection);
        $this->individual = $individual ?? new IndividualRankingService(new MysqliIndividualRankingRepository($connection));
    }

    public function modality(int $id): ?array
    {
        $statement = $this->connection->prepare('SELECT m.interclasses_id_interclasse, m.tipos_modalidades_id_tipo_modalidade, tm.nome_tipo_modalidade FROM modalidades m LEFT JOIN tipos_modalidades tm ON tm.id_tipo_modalidade = m.tipos_modalidades_id_tipo_modalidade WHERE m.id_modalidade = ? LIMIT 1');
        $statement->bind_param('i', $id);
        $statement->execute();
        $row = $statement->get_result()->fetch_assoc();
        $statement->close();
        if ($row !== null) {
            $row['tipo_competicao'] = \App\Modules\Competicoes\Domain\TipoCompeticaoRules::resolve($row);
        }
        return $row;
    }

    public function read(int $id, bool $individual, string $action): array
    {
        if ($individual) {
            return $action === 'participantes'
                ? ['success' => true, 'participantes' => MysqliIndividualRepository::buscarParticipantes($this->connection, $id)]
                : MysqliIndividualRepository::montarJsonRanking($this->connection, $id);
        }
        return $this->atomic(function () use ($id, $action): array {
            // Mantém chaves antigas coerentes quando um bye no último slot já
            // estava concluído antes da correção do avanço.
            MysqliChaveamentoRepository::reconciliarAvancosPendentes($this->connection, $id);
            return $action === 'historico'
                ? MysqliChaveamentoRepository::montarHistorico($this->connection, $id)
                : MysqliChaveamentoRepository::montarJsonArvore($this->connection, $id);
        });
    }

    public function saveIndividual(int $id, ?array $ranking, ?int $gameId = null): array
    {
        return $this->atomic(fn (): array => $this->individual->registrar($id, $ranking, $gameId));
    }

    public function createBracket(int $id): array
    {
        return $this->atomic(function () use ($id): array {
            $teams = MysqliChaveamentoRepository::buscarEquipesValidadas($this->connection, $id);
            if (count($teams) < 2) {
                throw new \InvalidArgumentException('É necessário ao menos duas equipes ativas com competidores vinculados (elenco).');
            }
            $result = MysqliChaveamentoRepository::criarChaveamentoInicial($this->connection, $id, $teams);
            foreach ($result['bye_jogos'] as $bye) {
                MysqliChaveamentoRepository::chaveamentoProcessarAvanco($this->connection, (int) $bye);
            }
            return ['success' => true, 'message' => 'Chaveamento mata-mata gerado.', 'jogos_criados' => $result['jogos_criados'], 'bye_inicial' => count($result['bye_jogos'])];
        });
    }

    /** @param callable():array<string, mixed> $action
     * @return array<string, mixed>
     */
    private function atomic(callable $action): array
    {
        return $this->transactions->run($action);
    }
}
