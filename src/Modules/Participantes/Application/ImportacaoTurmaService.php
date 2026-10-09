<?php

declare(strict_types=1);

namespace App\Modules\Participantes\Application;

use App\Modules\Participantes\Domain\AlunoPdfReader;
use App\Modules\Participantes\Domain\ImportacaoTurmaRepository;
use InvalidArgumentException;
use RuntimeException;

final class ImportacaoTurmaService
{
    public function __construct(private readonly ImportacaoTurmaRepository $repository, private readonly AlunoPdfReader $reader)
    {
    }

    /** @return array{nome:string, edicao:int} */
    public function validateDestination(int $class, int $edition): array
    {
        if ($class <= 0) {
            throw new InvalidArgumentException('Campo id_turma inválido.');
        }
        $record = $this->repository->findClass($class);
        if ($record === null) {
            throw new InvalidArgumentException('Turma não encontrada no banco.');
        }
        $classEdition = (int) $record['interclasses_id_interclasse'];
        if ($edition > 0 && $classEdition > 0 && $edition !== $classEdition) {
            throw new InvalidArgumentException('A turma não pertence à edição informada.');
        }
        $edition = $edition > 0 ? $edition : ($classEdition > 0 ? $classEdition : (int) $this->repository->findActiveEdition());
        if ($edition <= 0) {
            throw new InvalidArgumentException('Nenhum interclasse ativo encontrado. Informe id_interclasse no upload.');
        }
        return ['nome' => (string) $record['nome_turma'], 'edicao' => $edition];
    }

    /** @return array<string, mixed> */
    public function importar(string $path, int $class, int $edition): array
    {
        $destination = $this->validateDestination($class, $edition);
        $students = $this->reader->read($path);
        if ($students === []) {
            return ['success' => false, 'message' => 'Não foi possível extrair estudantes do PDF. O PDF pode ser uma imagem (digitalizada). Tente usar um conversor online: https://www.ilovepdf.com/pt', 'fallback_converter' => true];
        }
        foreach ($students as &$student) {
            $student['turma'] = $destination['nome'];
        }
        unset($student);
        $result = $this->repository->import($students, $class, $destination['edicao']);
        if ($result['status'] !== 'sucesso') {
            $message = $result['mensagem'] ?? 'Falha interna ao importar estudantes.';
            throw new RuntimeException(is_string($message) && $message !== '' ? $message : 'Falha interna ao importar estudantes.');
        }
        $parts = [];
        if ($result['cadastrados'] > 0) {
            $parts[] = $result['cadastrados'] . ' registros inseridos';
        }
        if ($result['duplicados'] > 0) {
            $parts[] = $result['duplicados'] . ' duplicados ignorados';
        }
        $message = 'Importação concluída: ' . ($parts ? implode(', ', $parts) : '0 registros inseridos');
        if ((int) ($result['cadastrados'] ?? 0) > 0) {
            $message .= '. Senha inicial: sesi-senai. A troca é obrigatória no primeiro acesso.';
        }
        $response = ['success' => true, 'message' => $message];
        if (!empty($result['erros'])) {
            $response['avisos'] = $result['erros'];
        }
        return $response;
    }
}
