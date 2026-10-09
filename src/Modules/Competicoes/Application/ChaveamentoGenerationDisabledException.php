<?php

declare(strict_types=1);

namespace App\Modules\Competicoes\Application;

use InvalidArgumentException;

final class ChaveamentoGenerationDisabledException extends InvalidArgumentException
{
    public const CODE = 'CHAVEAMENTO_DEVE_VIR_DO_CRONOGRAMA';

    public function __construct()
    {
        parent::__construct('Gere e publique o chaveamento pelo calendário da edição; a geração separada foi removida.');
    }
}
