<?php

declare(strict_types=1);

namespace App\Modules\Competicoes\Application;

use App\Modules\Competicoes\Domain\CronogramaRepository;
use InvalidArgumentException;

final class CronogramaService
{
    public function __construct(private readonly CronogramaRepository $repository)
    {
    }

    /** @return array<string,mixed> */
    public function estado(int $editionId): array
    {
        if ($editionId <= 0) {
            throw new InvalidArgumentException('O ID da edição é obrigatório.');
        }
        return $this->repository->state($editionId);
    }

    /**
     * Consulta a agenda publicada no escopo do aluno autenticado.
     *
     * @param list<int> $teamIds
     * @return array<string,mixed>
     */
    public function agendaAluno(int $editionId, int $userId, array $teamIds = []): array
    {
        if ($editionId <= 0 || $userId <= 0) {
            throw new InvalidArgumentException('Edição e usuário são obrigatórios.');
        }

        return $this->repository->studentAgenda($editionId, $userId, $teamIds);
    }

    public function preparar(int $editionId, int $userId): array
    {
        if ($editionId <= 0 || $userId <= 0) {
            throw new InvalidArgumentException('Edição e usuário são obrigatórios.');
        }
        return $this->repository->prepareTeams($editionId, $userId);
    }

    /** @param array<string,mixed> $options @return array<string,mixed> */
    public function gerar(int $editionId, int $userId, array $options): array
    {
        if ($editionId <= 0 || $userId <= 0) {
            throw new InvalidArgumentException('Edição e usuário são obrigatórios.');
        }
        return $this->repository->generateDraft($editionId, $userId, $options);
    }

    /** @param array<string,mixed> $data @return array<string,mixed> */
    public function publicar(int $editionId, int $userId, array $data): array
    {
        return $this->repository->publish($editionId, $userId, $this->revision($data), $this->commitments($data), $this->nodes($data));
    }

    /** @param array<string,mixed> $data @return array<string,mixed> */
    public function abrir(int $editionId, int $userId, array $data): array
    {
        $opening = $this->dateTime($data['inscricoes_abertura'] ?? null);
        $closing = $this->dateTime($data['inscricoes_encerramento'] ?? null);
        if ($opening === null || $closing === null) {
            throw new InvalidArgumentException('A abertura exige início e encerramento explícitos do período.');
        }
        if ($opening >= $closing) {
            throw new InvalidArgumentException('O encerramento deve ser posterior à abertura.');
        }
        $timezone = new \DateTimeZone(date_default_timezone_get());
        $closingDate = \DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $closing, $timezone);
        if ($closingDate === false || $closingDate <= new \DateTimeImmutable('now', $timezone)) {
            throw new InvalidArgumentException('O encerramento precisa estar no futuro para abrir as inscrições.');
        }
        return $this->repository->openRegistrations($editionId, $userId, $this->revision($data), $opening, $closing);
    }

    /** @param array<string,mixed> $data @return array<string,mixed> */
    public function fechar(int $editionId, int $userId, array $data): array
    {
        return $this->repository->closeRegistrations($editionId, $userId, $this->revision($data));
    }

    /** @param array<string,mixed> $data @return array<string,mixed> */
    public function liberar(int $editionId, int $userId, array $data): array
    {
        return $this->repository->releaseOperation($editionId, $userId, $this->revision($data));
    }

    /** @param array<string,mixed> $data @return array<string,mixed> */
    public function revisar(int $editionId, int $userId, array $data): array
    {
        return $this->repository->review($editionId, $userId, $this->revision($data));
    }

    /** @param array<string,mixed> $data @return array<string,mixed> */
    public function materializar(int $editionId, int $userId, array $data): array
    {
        $nodeId = filter_var($data['id_no'] ?? null, FILTER_VALIDATE_INT);
        if ($nodeId === false || $nodeId <= 0) {
            throw new InvalidArgumentException('O ID persistente do nó é obrigatório.');
        }
        return $this->repository->materializeNode($editionId, $userId, (int) $nodeId);
    }

    private function revision(array $data): int
    {
        if (!array_key_exists('cronograma_versao', $data)) {
            throw new InvalidArgumentException('A revisão do cronograma é obrigatória.');
        }
        $revision = filter_var($data['cronograma_versao'], FILTER_VALIDATE_INT);
        if ($revision === false || $revision < 0) {
            throw new InvalidArgumentException('A revisão do cronograma é inválida.');
        }
        return (int) $revision;
    }

    /** @return list<array<string,mixed>> */
    private function commitments(array $data): array
    {
        $items = $data['compromissos'] ?? [];
        if (!is_array($items)) {
            throw new InvalidArgumentException('Os compromissos do cronograma são inválidos.');
        }
        if (array_filter($items, static fn (mixed $item): bool => !is_array($item)) !== []) {
            throw new InvalidArgumentException('Os compromissos do cronograma são inválidos.');
        }
        return array_values($items);
    }

    /** @return list<array<string,mixed>> */
    private function nodes(array $data): array
    {
        $items = $data['nos'] ?? [];
        if (!is_array($items)) {
            throw new InvalidArgumentException('Os nós do cronograma são inválidos.');
        }
        if (array_filter($items, static fn (mixed $item): bool => !is_array($item)) !== []) {
            throw new InvalidArgumentException('Os nós do cronograma são inválidos.');
        }
        return array_values($items);
    }

    private function dateTime(mixed $value): ?string
    {
        if ($value === null || trim((string) $value) === '') {
            return null;
        }
        $normalised = str_replace('T', ' ', trim((string) $value));
        if (preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/', $normalised) === 1) {
            $normalised .= ':00';
        }
        $parsed = \DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $normalised);
        $errors = \DateTimeImmutable::getLastErrors();
        if ($parsed === false || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))) {
            throw new InvalidArgumentException('A data do período de inscrições é inválida.');
        }
        return $parsed->format('Y-m-d H:i:s');
    }
}
