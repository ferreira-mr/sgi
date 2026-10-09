<?php

declare(strict_types=1);

namespace App\Modules\Competicoes\Domain;

use App\Modules\Participantes\Domain\InscricaoRules;
use InvalidArgumentException;

final class EquipeRosterRules
{
    /**
     * @param array<string, mixed> $team
     * @param array<string, mixed> $class
     * @param array<string, mixed> $modality
     */
    public static function validarContexto(array $team, array $class, array $modality): void
    {
        if ((string) ($team['status_equipe'] ?? '0') !== '1') {
            throw new InvalidArgumentException('A equipe está inativa.');
        }
        if ((string) ($class['status_turma'] ?? '0') !== '1') {
            throw new InvalidArgumentException('A turma da equipe está inativa.');
        }
        if ((string) ($modality['status_modalidade'] ?? '0') !== '1') {
            throw new InvalidArgumentException('A modalidade da equipe está inativa.');
        }

        $editionId = (int) ($class['interclasses_id_interclasse'] ?? 0);
        if ($editionId <= 0
            || $editionId !== (int) ($modality['interclasses_id_interclasse'] ?? 0)
            || (int) ($team['turmas_id_turma'] ?? 0) !== (int) ($class['id_turma'] ?? 0)
            || (int) ($team['modalidades_id_modalidade'] ?? 0) !== (int) ($modality['id_modalidade'] ?? 0)
        ) {
            throw new InvalidArgumentException('Equipe, turma e modalidade não pertencem ao mesmo interclasse.');
        }

        if ((int) ($class['categorias_id_categoria'] ?? 0) <= 0
            || (int) $class['categorias_id_categoria'] !== (int) ($modality['categorias_id_categoria'] ?? 0)
        ) {
            throw new InvalidArgumentException('A categoria da modalidade não corresponde à categoria da turma.');
        }
    }

    /**
     * @param array<string, mixed> $student
     * @param array<string, mixed> $team
     * @param array<string, mixed> $class
     * @param array<string, mixed> $modality
     */
    public static function validarAluno(array $student, array $team, array $class, array $modality): void
    {
        if ((string) ($student['status_usuario'] ?? '0') !== '1'
            || (string) ($student['nivel_usuario'] ?? '') !== '3'
        ) {
            throw new InvalidArgumentException('Somente estudantes ativos podem ser vinculados à equipe.');
        }

        if ((int) ($student['interclasses_id_interclasse'] ?? 0)
                !== (int) ($class['interclasses_id_interclasse'] ?? 0)
            || (int) ($student['turmas_id_turma'] ?? 0) !== (int) ($team['turmas_id_turma'] ?? 0)
        ) {
            throw new InvalidArgumentException('O estudante deve pertencer à mesma edição e turma da equipe.');
        }

        if (!InscricaoRules::modalidadeCompativel(
            (string) ($student['genero_usuario'] ?? ''),
            (string) ($modality['genero_modalidade'] ?? ''),
            (int) ($class['categorias_id_categoria'] ?? 0),
            (int) ($modality['categorias_id_categoria'] ?? 0),
        )) {
            throw new InvalidArgumentException('O gênero ou a categoria do estudante é incompatível com a modalidade.');
        }
    }

    /** @param list<int> $existingModalityIds */
    public static function validarLimiteModalidades(array $existingModalityIds, int $targetModalityId): void
    {
        try {
            InscricaoRules::uniaoModalidades($existingModalityIds, [$targetModalityId]);
        } catch (InvalidArgumentException $exception) {
            throw new InvalidArgumentException('Máximo de 3 modalidades permitidas por estudante.', 0, $exception);
        }
    }

    public static function validarCapacidadeEquipe(int $activeMembers, int $newMembers, ?int $maxMembers): void
    {
        if ($newMembers < 0 || $activeMembers < 0) {
            throw new InvalidArgumentException('A quantidade de membros da equipe é inválida.');
        }
        if ($maxMembers !== null && $maxMembers > 0 && $activeMembers + $newMembers > $maxMembers) {
            throw new InvalidArgumentException('A equipe atingiu o limite máximo de estudantes.');
        }
    }

    public static function validarCapacidadeModalidade(
        int $activeMembers,
        int $newMembers,
        ?int $maxMembersPerTeam,
        ?int $maxTeams,
    ): void {
        if ($maxMembersPerTeam === null || $maxMembersPerTeam <= 0 || $maxTeams === null || $maxTeams <= 0) {
            return;
        }
        if ($activeMembers + $newMembers > $maxMembersPerTeam * $maxTeams) {
            throw new InvalidArgumentException('A modalidade atingiu o limite máximo de inscritos para esta turma.');
        }
    }
}
