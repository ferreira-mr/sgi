<?php

declare(strict_types=1);

namespace App\Modules\Participantes\Presentation\Http;

use App\Modules\Participantes\Application\InscricaoService;
use App\Modules\Participantes\Domain\InscricaoRecusadaException;
use App\Shared\Http\AccessGuard;
use App\Shared\Http\Request;
use App\Shared\Http\Response;

final class InscricaoController
{
    public function __construct(private readonly InscricaoService $service)
    {
    }

    public function __invoke(Request $request): Response
    {
        if ($request->method() !== 'POST') {
            return Response::json(['success' => false, 'message' => 'Método não permitido.'], 405);
        }
        if (($denied = AccessGuard::authorize([3])) !== null) {
            return $denied;
        }
        try {
            $userId = (int) ($_SESSION['id_usuario'] ?? $_SESSION['id'] ?? 0);
            return Response::json($this->service->inscrever($userId, $request->allInput()));
        } catch (InscricaoRecusadaException $exception) {
            return Response::json(['success' => false, 'code' => 'INSCRICAO_RECUSADA', 'message' => $exception->getMessage()], 409);
        } catch (\InvalidArgumentException $exception) {
            return Response::json(['success' => false, 'code' => 'INSCRICAO_INVALIDA', 'message' => $exception->getMessage()], 422);
        } catch (\Throwable $exception) {
            error_log('Falha ao processar inscrição: ' . $exception->getMessage());
            return Response::json(['success' => false, 'message' => 'Não foi possível processar a inscrição.'], 500);
        }
    }
}
