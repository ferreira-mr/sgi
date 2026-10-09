<?php

declare(strict_types=1);

namespace App\Modules\Participantes\Domain;

interface InscricaoRepository
{
    /**
     * @param list<int> $teamIds
     * @return array{success:bool,message:string,insercoes:int,ja_existentes:int,erros:list<string>}
     */
    public function subscribe(int $userId, int $editionId, array $teamIds, ?int $expectedRevision = null, ?int $expectedPublishedVersion = null): array;
}
