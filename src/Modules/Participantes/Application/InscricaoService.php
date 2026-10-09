<?php

declare(strict_types=1);

namespace App\Modules\Participantes\Application;

use App\Modules\Participantes\Domain\InscricaoRepository;
use App\Modules\Participantes\Domain\InscricaoRules;
use InvalidArgumentException;

final class InscricaoService
{
    public function __construct(private readonly InscricaoRepository $inscricoes)
    {
    }

    /**
     * @param array<string, mixed> $data
     * @return array{success:bool,message:string,insercoes:int,ja_existentes:int,erros:list<string>}
     */
    public function inscrever(int $userId, array $data): array
    {
        $editionId = (int) ($data['id_interclasse'] ?? 0);
        $teamIds = $data['id_equipes'] ?? [];
        if ($editionId <= 0 || !is_array($teamIds) || $teamIds === []) {
            throw new InvalidArgumentException('id_interclasse e id_equipes são obrigatórios.');
        }
        $normalised = InscricaoRules::normalizarIds($teamIds);
        if (count($normalised) > 3) {
            throw new InvalidArgumentException('Máximo de 3 modalidades permitidas.');
        }
        if ($normalised === []) {
            throw new InvalidArgumentException('Nenhuma equipe válida informada.');
        }

        $revision = null;
        if (array_key_exists('cronograma_versao', $data)) {
            $revision = filter_var($data['cronograma_versao'], FILTER_VALIDATE_INT);
            if ($revision === false || $revision < 0) {
                throw new InvalidArgumentException('A revisão do cronograma é inválida.');
            }
            $revision = (int) $revision;
        }
        $publishedVersion = null;
        if (array_key_exists('versao_publicada', $data)) {
            $publishedVersion = filter_var($data['versao_publicada'], FILTER_VALIDATE_INT);
            if ($publishedVersion === false || $publishedVersion < 0) {
                throw new InvalidArgumentException('A versão publicada do cronograma é inválida.');
            }
            $publishedVersion = (int) $publishedVersion;
        }
        return $this->inscricoes->subscribe($userId, $editionId, $normalised, $revision, $publishedVersion);
    }
}
