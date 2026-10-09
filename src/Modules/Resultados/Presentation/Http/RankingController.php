<?php

declare(strict_types=1);

namespace App\Modules\Resultados\Presentation\Http;

use App\Modules\Resultados\Application\RankingService;
use App\Modules\Eventos\Domain\EdicaoConsulta;
use App\Shared\Http\AccessGuard;
use App\Shared\Http\Request;
use App\Shared\Http\Response;
use Throwable;

final class RankingController
{
    public function __construct(private readonly RankingService $service, private readonly EdicaoConsulta $edicoes)
    {
    }

    /** @param array<string, string> $parameters */
    public function __invoke(Request $request, array $parameters = []): Response
    {
        if ($request->method() === 'OPTIONS') {
            return Response::empty(204, [
                'Access-Control-Allow-Methods' => 'GET, POST, PUT, OPTIONS',
                'Access-Control-Allow-Headers' => 'Content-Type, Authorization',
            ]);
        }

        $authorization = AccessGuard::authorize([0, 1, 3]);
        if ($authorization !== null) {
            return $authorization;
        }

        try {
            return match ($request->method()) {
                'GET' => $this->list($request),
                'POST' => $this->handlePost($request),
                'PUT' => $this->update($request),
                default => Response::json(['success' => false, 'message' => 'Método não permitido.'], 405),
            };
        } catch (\InvalidArgumentException $exception) {
            return Response::json(['success' => false, 'message' => $exception->getMessage()], 400);
        } catch (\Throwable $exception) {
            error_log('Falha em RankingController: ' . $exception->getMessage());

            return Response::json(['success' => false, 'message' => 'Não foi possível processar o ranking.'], 500);
        }
    }

    private function handlePost(Request $request): Response
    {
        $authorization = AccessGuard::authorize([0]);
        if ($authorization !== null) {
            return $authorization;
        }

        $writeDenied = AccessGuard::requireWrite();
        if ($writeDenied !== null) {
            return $writeDenied;
        }

        $editionId = (int) ($request->input('id_interclasse') ?? $request->query('id_interclasse', 0));
        if ($editionId <= 0) {
            return Response::json(['success' => false, 'message' => 'O ID da edição é obrigatório.'], 400);
        }

        $action = (string) ($request->input('acao') ?? $request->query('acao', 'reconciliar'));
        if ($action !== 'reconciliar') {
            return Response::json(['success' => false, 'message' => 'Ação não suportada.'], 400);
        }

        $resultado = $this->service->reconciliar($editionId);

        return Response::json([
            'success' => true,
            'message' => 'Ranking recalculado e reconciliado com sucesso!',
            'dados' => $resultado,
        ]);
    }

    private function list(Request $request): Response
    {
        $isAluno = (int) ($_SESSION['nivel'] ?? -1) === 3;
        $editionId = (int) $request->query('id_interclasse', 0);
        if ($isAluno && $editionId <= 0) {
            return Response::json(['success' => false, 'message' => 'Selecione uma edição encerrada.'], 400);
        }
        if ($isAluno && ($this->edicoes->isActive($editionId) || !$this->edicoes->isRankingPublished($editionId))) {
            return Response::json(['success' => false, 'bloqueado' => true, 'message' => 'O ranking será exibido após o encerramento e a publicação do Interclasse.'], 403);
        }
        $data = $this->service->listar([
            'id_turma' => (int) $request->query('id_turma', 0),
            'id_interclasse' => (int) $request->query('id_interclasse', 0),
            'id_categoria' => (int) $request->query('id_categoria', 0),
            'turno' => (string) $request->query('turno', ''),
            'busca' => trim((string) $request->query('busca', '')),
            'somente_encerrados' => $isAluno,
        ]);

        return Response::json($data);
    }

    private function update(Request $request): Response
    {
        $authorization = AccessGuard::requireWrite();
        if ($authorization !== null) {
            return $authorization;
        }

        $updated = $this->service->atualizar($request->allInput());

        return Response::json([
            'success' => true,
            'message' => $updated
                ? 'Turma atualizada com sucesso!'
                : 'Nenhuma alteração realizada (dados idênticos ou ID inexistente).',
        ]);
    }
}
