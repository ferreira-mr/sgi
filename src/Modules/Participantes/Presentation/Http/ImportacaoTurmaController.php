<?php

declare(strict_types=1);

namespace App\Modules\Participantes\Presentation\Http;

use App\Modules\Participantes\Application\ImportacaoTurmaService;
use App\Modules\Participantes\Infrastructure\TurmaPdfStorage;
use App\Shared\Http\AccessGuard;
use App\Shared\Http\Request;
use App\Shared\Http\Response;

final class ImportacaoTurmaController
{
    public function __construct(private readonly ImportacaoTurmaService $service, private readonly TurmaPdfStorage $storage)
    {
    }

    public function __invoke(Request $request): Response
    {
        if (($denied = AccessGuard::requireWrite()) !== null) {
            return $denied;
        }
        $outputBufferLevel = ob_get_level();
        ob_start();
        try {
            $file = $request->file('pdf_arquivo', $request->file('pdf'));
            if (!is_array($file)) {
                throw new \InvalidArgumentException('Nenhum arquivo enviado. Campo esperado: pdf_arquivo');
            }
            $class = (int) $request->input('id_turma', 0);
            $edition = (int) $request->input('id_interclasse', 0);
            $this->service->validateDestination($class, $edition);
            return Response::json($this->storage->process($file, $class, fn (string $path): array => $this->service->importar($path, $class, $edition)));
        } catch (\InvalidArgumentException $exception) {
            // O contrato JSON mantém o campo success também para validações.
            return Response::json(['success' => false, 'message' => $exception->getMessage()], 400);
        } catch (\Throwable $exception) {
            error_log('Falha ao importar PDF da turma: ' . $exception->getMessage());
            return Response::json(['success' => false, 'message' => 'Não foi possível importar os estudantes.'], 500);
        } finally {
            while (ob_get_level() > $outputBufferLevel) {
                ob_end_clean();
            }
        }
    }
}
