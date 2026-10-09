<?php

declare(strict_types=1);

namespace App\Modules\Acesso\Application;

use App\Modules\Acesso\Domain\FotoStorage;
use App\Modules\Acesso\Domain\UsuarioConsultaRepository;
use App\Modules\Acesso\Domain\UsuarioManagementRepository;
use App\Modules\Participantes\Domain\MatriculaRules;
use App\Shared\Application\TransactionRunner;
use RuntimeException;

final class UsuarioService
{
    public function __construct(
        private readonly UsuarioConsultaRepository $consultas,
        private readonly UsuarioManagementRepository $usuarios,
        private readonly FotoStorage $fotos,
        private readonly TransactionRunner $transactions,
    ) {
    }

    /** @return array<string, mixed>|null */
    public function validarInscricao(string $registration, string $birth, int $editionId): ?array
    {
        $normalised = MatriculaRules::normalizarRa($registration);
        $parsedBirth = MatriculaRules::parseDataNascimento($birth);
        if ($normalised === '' || $parsedBirth === null || $editionId <= 0) {
            return null;
        }

        return $this->consultas->findCompetitorForValidation($normalised, $parsedBirth, $editionId);
    }

    /** @param array<string, mixed> $data @return array<string, mixed> */
    public function criarAluno(array $data, int $editionId): array
    {
        $name = trim((string) ($data['nome_usuario'] ?? ''));
        $registration = MatriculaRules::normalizarRa((string) ($data['matricula_usuario'] ?? ''));
        $birth = MatriculaRules::parseDataNascimento((string) ($data['data_nasc_usuario'] ?? ''));
        $classId = (int) ($data['turmas_id_turma'] ?? 0);
        if ($name === '' || $registration === '' || $birth === null || $classId <= 0) {
            throw new RuntimeException('Campos obrigatórios: nome, RM, data de nascimento e turma.');
        }
        $data['nome_usuario'] = $name;
        $data['matricula_usuario'] = $registration;
        $data['data_nasc_usuario'] = $birth;
        $data['turmas_id_turma'] = $classId;
        $data['genero_usuario'] = $this->gender($data['genero_usuario'] ?? 'MASC');

        return $this->usuarios->createStudent($data, $editionId);
    }

    public function atribuirAluno(int $userId, int $classId, int $editionId): void
    {
        if ($userId <= 0 || $classId <= 0 || $editionId <= 0) {
            throw new RuntimeException('Dados de vínculo do estudante inválidos.');
        }
        $this->usuarios->assignStudent($userId, $classId, $editionId);
    }

    /** @param array<string, mixed> $data @return array<string, mixed> */
    public function cadastrarColaborador(array $data, int $editionId, ?string $temporaryPhotoPath = null): array
    {
        $name = trim((string) ($data['nome_usuario'] ?? ''));
        $registration = trim((string) ($data['matricula_usuario'] ?? ''));
        $password = (string) ($data['senha_usuario'] ?? '');
        $birth = MatriculaRules::parseDataNascimento((string) ($data['data_nasc_usuario'] ?? ''));
        if ($name === '' || $registration === '' || $password === '' || $birth === null) {
            throw new RuntimeException('Campos incompletos');
        }
        $normalised = MatriculaRules::normalizarRa($registration) ?: $registration;
        $master = ['sgi@sgi.com', 'colab@sgi.com', 'mes@sgi.com'];
        if (in_array(strtolower($registration), $master, true) || in_array(strtolower($normalised), $master, true)) {
            throw new RuntimeException('Este email pertence a uma conta padrão do sistema e não pode ser reutilizado.');
        }
        $data['nome_usuario'] = $name;
        $data['matricula_usuario'] = $normalised;
        $data['data_nasc_usuario'] = $birth;
        $data['genero_usuario'] = $this->gender($data['genero_usuario'] ?? 'MASC');

        $photoFilename = 'default.jpg';
        if ($temporaryPhotoPath !== null && $temporaryPhotoPath !== '') {
            $photoFilename = $this->fotos->save($temporaryPhotoPath);
            try {
                return $this->usuarios->createStaff($data, $editionId, $photoFilename);
            } catch (\Throwable $exception) {
                $this->fotos->remove($photoFilename);
                throw $exception;
            }
        }

        return $this->usuarios->createStaff($data, $editionId, $photoFilename);
    }

    /** @param array<string, mixed> $data */
    public function atualizarColaborador(array $data, int $editionId): void
    {
        if ((int) ($data['id_usuario'] ?? 0) <= 0) {
            throw new RuntimeException('ID do colaborador inválido.');
        }
        $this->transactions->run(function () use ($data, $editionId): void {
            $this->usuarios->updateStaffRole($data, $editionId);
        });
    }

    /** @param array<string, mixed> $data */
    public function atualizarDadosColaborador(array $data, int $editionId, int $currentUserId): void
    {
        $id = (int) ($data['id_usuario'] ?? 0);
        $data['nome_usuario'] = trim((string) ($data['nome_usuario'] ?? ''));
        $registration = trim((string) ($data['matricula_usuario'] ?? ''));
        if ($id <= 0 || $data['nome_usuario'] === '' || $registration === '') {
            throw new RuntimeException('Nome e matrícula são obrigatórios.');
        }
        if ($currentUserId <= 0) {
            throw new RuntimeException('Sessão inválida. Faça login novamente.');
        }
        $level = $this->usuarios->findStaffLevel($id, $editionId);
        if ($level === null || !in_array($level, ['0', '1', '2'], true)) {
            throw new RuntimeException('Colaborador não encontrado ou fora da edição ativa.');
        }
        if ($level === '0' && $id !== $currentUserId) {
            throw new UsuarioProtegidoException('Não é possível alterar os dados de outro administrador.');
        }
        $data['matricula_usuario'] = MatriculaRules::normalizarRa($registration) ?: $registration;
        $data['genero_usuario'] = $this->gender($data['genero_usuario'] ?? 'MASC');
        $this->usuarios->updateStaffDetails($data, $editionId, $currentUserId);
    }

    /** @param array<string, mixed> $data */
    public function editarAluno(array $data, int $editionId): void
    {
        $data['nome_usuario'] = trim((string) ($data['nome_usuario'] ?? ''));
        $registration = MatriculaRules::normalizarRa((string) ($data['matricula_usuario'] ?? ''));
        $birth = MatriculaRules::parseDataNascimento((string) ($data['data_nasc_usuario'] ?? ''));
        if ((int) ($data['id_usuario'] ?? 0) <= 0 || $data['nome_usuario'] === '' || $registration === '' || $birth === null) {
            throw new RuntimeException('Campos obrigatórios: nome, RM e data de nascimento.');
        }
        $data['matricula_usuario'] = $registration;
        $data['data_nasc_usuario'] = $birth;
        $data['genero_usuario'] = $this->gender($data['genero_usuario'] ?? 'MASC');
        $this->usuarios->updateStudent($data, $editionId);
    }

    private function gender(mixed $gender): string
    {
        $normalised = strtoupper((string) $gender);
        return in_array($normalised, ['FEM', 'MASC'], true) ? $normalised : 'MASC';
    }
}
