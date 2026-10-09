<?php

declare(strict_types=1);

namespace App\Modules\Competicoes\Domain;

interface ChaveamentoManagement
{
    /** @return array<string, mixed>|null */
    public function modality(int $id): ?array;
    /** @return array<mixed> */
    public function read(int $id, bool $individual, string $action): array;
    /** @param array{primeiro:mixed, segundo:mixed, terceiro:mixed}|null $ranking
     * @return array<string, mixed>
     */
    public function saveIndividual(int $id, ?array $ranking, ?int $gameId = null): array;
}
