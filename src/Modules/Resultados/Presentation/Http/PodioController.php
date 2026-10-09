<?php

declare(strict_types=1);

namespace App\Modules\Resultados\Presentation\Http;

use App\Modules\Resultados\Application\PontuacaoService;
use App\Modules\Resultados\Domain\PodioRepository;
use App\Shared\Http\AccessGuard;
use App\Shared\Http\Request;
use App\Shared\Http\Response;
use InvalidArgumentException;
use Throwable;

final class PodioController
{
    public function __construct(
        private readonly PontuacaoService $service,
    ) {
    }

    public function __invoke(Request $request): Response
    {
        if ($request->method() === 'OPTIONS') {
            return Response::empty(204, [
                'Access-Control-Allow-Methods' => 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers' => 'Content-Type, Authorization',
            ]);
        }

        try {
            return match ($request->method()) {
                'GET' => $this->consultar($request),
                'POST' => $this->salvar($request),
                default => Response::json(['success' => false, 'message' => 'Método não permitido.'], 405),
            };
        } catch (InvalidArgumentException $exception) {
            return Response::json(['success' => false, 'message' => $exception->getMessage()], 400);
        } catch (Throwable $exception) {
            error_log('Falha em PodioController: ' . $exception->getMessage());
            return Response::json(['success' => false, 'message' => 'Não foi possível processar o pódio.'], 500);
        }
    }

    private function consultar(Request $request): Response
    {
        $denied = AccessGuard::authorize([0, 1, 2, 3]);
        if ($denied !== null) {
            return $denied;
        }

        $editionId = (int) $request->query('id_interclasse', 0);
        $modalityId = (int) $request->query('id_modalidade', 0);
        if ($editionId <= 0 || $modalityId <= 0) {
            return Response::json(['success' => false, 'message' => 'Edição e modalidade são obrigatórias.'], 400);
        }

        $podio = $this->service->carregarPodioModalidade($editionId, $modalityId);
        return Response::json([
            'success' => true,
            'podio' => $podio,
        ]);
    }

    private function salvar(Request $request): Response
    {
        $denied = AccessGuard::authorize([0]);
        if ($denied !== null) {
            return $denied;
        }

        $writeDenied = AccessGuard::requireWrite();
        if ($writeDenied !== null) {
            return $writeDenied;
        }

        $data = $request->allInput();
        $editionId = (int) ($data['id_interclasse'] ?? 0);
        $modalityId = (int) ($data['id_modalidade'] ?? 0);
        $podio = $data['podio'] ?? [];

        if ($editionId <= 0 || $modalityId <= 0) {
            throw new InvalidArgumentException('Edição e modalidade são obrigatórias.');
        }

        if (!is_array($podio) || $podio === []) {
            throw new InvalidArgumentException('O pódio deve conter ao menos uma posição.');
        }

        $this->service->salvarPodioManual($editionId, $modalityId, $podio);

        return Response::json([
            'success' => true,
            'message' => 'Pódio atualizado e pontuações aplicadas com sucesso!',
        ]);
    }
}
