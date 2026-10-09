<?php

declare(strict_types=1);

namespace App\Modules\Competicoes\Application;

use App\Modules\Competicoes\Domain\ChaveamentoManagement;
use App\Modules\Competicoes\Domain\TipoCompeticaoRules;
use InvalidArgumentException;

final class ChaveamentoService
{
    public function __construct(private readonly ChaveamentoManagement $repository)
    {
    }

    public function edition(int $id): ?int
    {
        $modality = $this->repository->modality($id);
        return isset($modality['interclasses_id_interclasse']) ? (int) $modality['interclasses_id_interclasse'] : null;
    }

    /** @return array<string,mixed>|null */
    public function modalidade(int $id): ?array
    {
        return $id > 0 ? $this->repository->modality($id) : null;
    }

    /** @return array<mixed> */
    public function consultar(int $id, bool $individual, string $action): array
    {
        if ($id <= 0) {
            throw new InvalidArgumentException('ID da modalidade é obrigatório.');
        }
        if (!$individual && $action === 'classificacao') {
            $result = $this->repository->read($id, false, 'historico');
            unset($result['confrontos']);
            return $result;
        }
        return $this->repository->read($id, $individual, $action);
    }

    /** @param array<string, mixed>|null $ranking
     * @return array<string, mixed>
     */
    public function gerar(int $id, bool $individual, ?array $ranking, bool $rankingInformado = false, ?int $gameId = null): array
    {
        if ($id <= 0) {
            throw new InvalidArgumentException('Informe o ID da modalidade.');
        }
        if ($gameId !== null && $gameId <= 0) {
            throw new InvalidArgumentException('O ID do jogo deve ser um inteiro positivo.');
        }
        if ($individual) {
            if (!$rankingInformado && $ranking === null) {
                throw new ChaveamentoGenerationDisabledException();
            }
            if ($ranking === null) {
                throw new InvalidArgumentException('É necessário informar o 1º, 2º e 3º lugar.');
            }
            $podium = isset($ranking['primeiro'], $ranking['segundo'], $ranking['terceiro'])
                ? ['primeiro' => $ranking['primeiro'], 'segundo' => $ranking['segundo'], 'terceiro' => $ranking['terceiro']]
                : throw new InvalidArgumentException('É necessário informar o 1º, 2º e 3º lugar.');
            return $gameId === null
                ? $this->repository->saveIndividual($id, $podium)
                : $this->repository->saveIndividual($id, $podium, $gameId);
        }
        $modality = $this->repository->modality($id);
        if ($modality !== null && TipoCompeticaoRules::isIndividual($modality)) {
            throw new InvalidArgumentException('A prova individual deve ser preparada pelo calendário da edição.');
        }
        throw new ChaveamentoGenerationDisabledException();
    }
}
