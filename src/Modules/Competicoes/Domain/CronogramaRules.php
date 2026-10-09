<?php

declare(strict_types=1);

namespace App\Modules\Competicoes\Domain;

use InvalidArgumentException;

final class CronogramaRules
{
    public const PLANEJADO = 'planejado';
    public const RASCUNHO = 'rascunho';
    public const PUBLICADO = 'publicado';
    public const REVISAO = 'revisao';

    /** @return array{quantidade:int,min:int,max:int,formato:string,duracao:?int,descanso:int} */
    public static function modalidade(array $data): array
    {
        $quantity = self::positive($data['equipes_planejadas'] ?? null, 'A quantidade planejada de equipes');
        $min = self::positive($data['min_inscritos_equipe'] ?? 1, 'O mínimo de inscritos por equipe');
        $max = self::positive($data['max_inscritos_equipe'] ?? ($data['max_inscrito_modalidade'] ?? 1), 'O máximo de inscritos por equipe');
        if ($min > $max) {
            throw new InvalidArgumentException('O mínimo de inscritos não pode superar o máximo.');
        }
        $format = (string) ($data['formato_participacao'] ?? 'equipe');
        if (!in_array($format, ['equipe', 'dupla', 'individual'], true)) {
            throw new InvalidArgumentException('Formato de participação inválido.');
        }
        if ($format === 'dupla' && ($min !== 2 || $max !== 2)) {
            throw new InvalidArgumentException('Uma dupla deve ter exatamente dois inscritos.');
        }
        if ($format === 'individual' && ($min !== 1 || $max !== 1)) {
            throw new InvalidArgumentException('Uma entrada individual deve ter exatamente um inscrito.');
        }
        $duration = self::optionalPositive($data['duracao_prevista_min'] ?? null, 'A duração prevista');
        $rest = self::nonNegative($data['descanso_min'] ?? 0, 'O descanso mínimo');
        return ['quantidade' => $quantity, 'min' => $min, 'max' => $max, 'formato' => $format, 'duracao' => $duration, 'descanso' => $rest];
    }

    public static function overlap(string $dateA, string $startA, string $endA, string $dateB, string $startB, string $endB, int $margin = 0): bool
    {
        if ($dateA !== $dateB) {
            return false;
        }
        $aStart = self::clock($startA);
        $aEnd = self::clock($endA);
        $bStart = self::clock($startB);
        $bEnd = self::clock($endB);
        if ($aStart === null || $aEnd === null || $bStart === null || $bEnd === null || $aEnd <= $aStart || $bEnd <= $bStart) {
            throw new InvalidArgumentException('Intervalo de cronograma inválido.');
        }
        return $aStart < $bEnd + $margin && $bStart < $aEnd + $margin;
    }

    /** @param array<string,mixed> $first @param array<string,mixed> $second */
    public static function schedulesConflict(array $first, array $second, int $margin = 0): bool
    {
        return self::overlap(
            (string) ($first['data_compromisso'] ?? $first['data'] ?? ''),
            (string) ($first['inicio_compromisso'] ?? $first['inicio'] ?? ''),
            (string) ($first['termino_compromisso'] ?? $first['fim'] ?? ''),
            (string) ($second['data_compromisso'] ?? $second['data'] ?? ''),
            (string) ($second['inicio_compromisso'] ?? $second['inicio'] ?? ''),
            (string) ($second['termino_compromisso'] ?? $second['fim'] ?? ''),
            $margin,
        );
    }

    public static function assertPlannedEdition(array $edition, ?\DateTimeImmutable $now = null): void
    {
        if ((string) ($edition['cronograma_status'] ?? self::RASCUNHO) !== self::PUBLICADO) {
            throw new InvalidArgumentException('O cronograma ainda não foi publicado.');
        }
        if ((string) ($edition['inscricoes_status'] ?? 'fechadas') !== 'abertas') {
            throw new InvalidArgumentException('As inscrições não estão abertas.');
        }
        $now ??= new \DateTimeImmutable('now');
        $open = self::dateTime($edition['inscricoes_abertura'] ?? null);
        $close = self::dateTime($edition['inscricoes_encerramento'] ?? null);
        if ($open === null || $close === null || $open >= $close) {
            throw new InvalidArgumentException('O período de inscrições precisa ter início e encerramento válidos.');
        }
        if ($now < $open) {
            throw new InvalidArgumentException('O período de inscrições ainda não começou.');
        }
        if ($now >= $close) {
            throw new InvalidArgumentException('O período de inscrições já terminou.');
        }
    }

    private static function positive(mixed $value, string $label): int
    {
        $number = filter_var($value, FILTER_VALIDATE_INT);
        if ($number === false || $number <= 0) {
            throw new InvalidArgumentException($label . ' deve ser um inteiro positivo.');
        }
        return (int) $number;
    }

    private static function optionalPositive(mixed $value, string $label): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }
        return self::positive($value, $label);
    }

    private static function nonNegative(mixed $value, string $label): int
    {
        $number = filter_var($value, FILTER_VALIDATE_INT);
        if ($number === false || $number < 0) {
            throw new InvalidArgumentException($label . ' deve ser um inteiro não negativo.');
        }
        return (int) $number;
    }

    private static function clock(string $value): ?int
    {
        if (!preg_match('/^(\d{2}):(\d{2})(?::\d{2})?$/', trim($value), $match)) {
            return null;
        }
        $hour = (int) $match[1];
        $minute = (int) $match[2];
        return $hour < 24 && $minute < 60 ? $hour * 60 + $minute : null;
    }

    private static function dateTime(mixed $value): ?\DateTimeImmutable
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
            throw new InvalidArgumentException('Data e hora do período de inscrições inválidas.');
        }
        return $parsed;
    }
}
