<?php

declare(strict_types=1);

namespace App\Modules\Participantes\Domain;

use InvalidArgumentException;

final class InscricaoRules
{
    public static function modalidadeCompativel(
        string $generoAluno,
        string $generoModalidade,
        int $categoriaTurma,
        int $categoriaModalidade,
    ): bool {
        return self::categoriaCompativel($categoriaTurma, $categoriaModalidade)
            && self::generoCompativel($generoAluno, $generoModalidade);
    }

    public static function categoriaCompativel(int $categoriaTurma, int $categoriaModalidade): bool
    {
        return $categoriaTurma > 0 && $categoriaTurma === $categoriaModalidade;
    }

    public static function generoCompativel(string $generoAluno, string $generoModalidade): bool
    {
        $studentGender = strtoupper(trim($generoAluno));
        $modalityGender = strtoupper(trim($generoModalidade));
        if (!in_array($studentGender, ['MASC', 'FEM'], true)) {
            return false;
        }

        return $modalityGender === 'MISTO' || $modalityGender === $studentGender;
    }

    /** @param array<int, mixed> $ids @return list<int> */
    public static function normalizarIds(array $ids): array
    {
        $normalised = [];
        foreach ($ids as $candidate) {
            $id = (int) $candidate;
            if ($id > 0) {
                $normalised[$id] = $id;
            }
        }

        return array_values($normalised);
    }

    /** @param list<int> $already @param list<int> $requested @return list<int> */
    public static function uniaoModalidades(array $already, array $requested, int $limit = 3): array
    {
        if ($limit <= 0) {
            throw new InvalidArgumentException('O limite de modalidades deve ser positivo.');
        }
        $union = array_values(array_unique([...$already, ...$requested]));
        sort($union, SORT_NUMERIC);
        if (count($union) > $limit) {
            throw new InvalidArgumentException('Máximo de ' . $limit . ' modalidades permitidas por estudante.');
        }

        return $union;
    }
}
