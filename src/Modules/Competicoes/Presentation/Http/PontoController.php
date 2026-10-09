<?php

declare(strict_types=1);

namespace App\Modules\Competicoes\Presentation\Http;

use App\Modules\Acesso\Presentation\Http\CompetitionAccess;
use App\Modules\Competicoes\Application\PontoService;
use App\Modules\Sincronizacao\Presentation\Http\MutationAction;
use App\Shared\Http\Request;
use App\Shared\Http\Response;

final class PontoController
{
    public function __construct(
        private readonly PontoService $service,
        private readonly CompetitionAccess $access,
        private readonly MutationAction $mutations,
    ) {
    }

    public function __invoke(Request $request): Response
    {
        if ($request->method() === 'GET') {
            if (($denied = $this->access->authorize()) !== null) {
                return $denied;
            }

            try {
                $filters = $request->allQuery();
                $gameId = (int) ($filters['id_jogo'] ?? 0);
                $teamId = (int) ($filters['id_equipe'] ?? $filters['equipes_id_equipe'] ?? 0);
                if (($filters['acao'] ?? '') === 'atletas') {
                    if ($teamId <= 0) {
                        return Response::json(['success' => false, 'message' => 'A equipe deve ser válida.'], 422);
                    }
                    $teamEdition = $this->service->edicaoDaEquipe($teamId);
                    if ($teamEdition === null) {
                        return Response::json(['success' => false, 'message' => 'Equipe não encontrada.'], 404);
                    }
                    $editionId = $teamEdition;
                    if ($gameId > 0) {
                        $gameEdition = $this->service->edicaoDoJogo($gameId);
                        if ($gameEdition === null) {
                            return Response::json(['success' => false, 'message' => 'Jogo não encontrado.'], 404);
                        }
                        if ($gameEdition !== $teamEdition) {
                            return Response::json(['success' => false, 'message' => 'O jogo e a equipe pertencem a edições diferentes.'], 422);
                        }
                        $editionId = $gameEdition;
                    }
                    if (($denied = $this->access->authorize($editionId)) !== null) {
                        return $denied;
                    }

                    return Response::json([
                        'success' => true,
                        'atletas' => $this->service->listarAtletas($gameId, $teamId),
                    ]);
                }
                if ($gameId <= 0) {
                    return Response::json(['success' => false, 'message' => 'O jogo deve ser informado.'], 400);
                }

                $editionId = $this->service->edicaoDoJogo($gameId);
                if ($editionId === null) {
                    return Response::json(['success' => false, 'message' => 'Jogo não encontrado.'], 404);
                }
                if ($teamId > 0) {
                    $teamEdition = $this->service->edicaoDaEquipe($teamId);
                    if ($teamEdition === null) {
                        return Response::json(['success' => false, 'message' => 'Equipe não encontrada.'], 404);
                    }
                    if ($teamEdition !== $editionId) {
                        return Response::json(['success' => false, 'message' => 'O jogo e a equipe pertencem a edições diferentes.'], 422);
                    }
                }
                if (($denied = $this->access->authorize($editionId)) !== null) {
                    return $denied;
                }

                return Response::json([
                    'success' => true,
                    'pontos' => $this->service->listarPontos($gameId, $teamId > 0 ? $teamId : null),
                ]);
            } catch (\InvalidArgumentException $exception) {
                return Response::json(['success' => false, 'message' => $exception->getMessage()], 422);
            } catch (\Throwable $exception) {
                error_log('Falha ao consultar pontos: ' . $exception->getMessage());
                return Response::json(['success' => false, 'message' => 'Não foi possível consultar os pontos.'], 500);
            }
        }

        if (($denied = $this->access->authorize()) !== null) {
            return $denied;
        }

        $action = function () use ($request): Response {
            try {
                $data = $request->allInput();
                $operatorId = (int) ($_SESSION['id_usuario'] ?? $_SESSION['id'] ?? 0);
                if ($request->method() === 'POST') {
                    $gameId = (int) ($data['jogos_id_jogo'] ?? $data['id_jogo'] ?? 0);
                    $teamId = (int) ($data['equipes_id_equipe'] ?? $data['id_equipe'] ?? 0);
                    if ($gameId > 0 && $teamId > 0) {
                        $editionId = $this->service->edicaoDoJogo($gameId);
                        if ($editionId === null) {
                            return Response::json(['success' => false, 'message' => 'Jogo não encontrado.'], 404);
                        }
                        $teamEdition = $this->service->edicaoDaEquipe($teamId);
                        if ($teamEdition === null) {
                            return Response::json(['success' => false, 'message' => 'Equipe não encontrada.'], 404);
                        }
                        if ($teamEdition !== $editionId) {
                            return Response::json(['success' => false, 'message' => 'O jogo e a equipe pertencem a edições diferentes.'], 422);
                        }
                        if (($denied = $this->access->authorize($editionId)) !== null) {
                            return $denied;
                        }
                    }

                    $point = $this->service->registrar($data, $operatorId);
                    return Response::json([
                        'success' => true,
                        'message' => 'Ponto registrado com o estudante responsável.',
                        'id' => (int) ($point['id_artilheiro'] ?? 0),
                        'id_ponto' => (int) ($point['id_artilheiro'] ?? 0),
                        'ponto' => $point,
                        'placar' => (int) ($point['resultado_partida'] ?? 0),
                    ]);
                }
                if ($request->method() === 'PUT') {
                    $pointId = (int) ($data['id_ponto'] ?? $data['id_artilheiro'] ?? 0);
                    if ($pointId > 0) {
                        $editionId = $this->service->edicaoDoPonto($pointId);
                        if ($editionId === null) {
                            return Response::json(['success' => false, 'message' => 'Ponto não encontrado.'], 404);
                        }
                        if (($denied = $this->access->authorize($editionId)) !== null) {
                            return $denied;
                        }
                    }
                    $point = $this->service->anular($pointId, $operatorId);
                    return Response::json([
                        'success' => true,
                        'message' => 'Ponto anulado; o registro do estudante foi preservado.',
                        'id_ponto' => (int) ($point['id_artilheiro'] ?? $pointId),
                        'ponto' => $point,
                        'placar' => (int) ($point['resultado_partida'] ?? 0),
                    ]);
                }
                return Response::json(['success' => false, 'message' => 'Método não permitido.'], 405);
            } catch (\InvalidArgumentException $exception) {
                return Response::json(['success' => false, 'message' => $exception->getMessage()], 422);
            } catch (\Throwable $exception) {
                error_log('Falha ao registrar ponto: ' . $exception->getMessage());
                return Response::json(['success' => false, 'message' => 'Não foi possível registrar o ponto.'], 500);
            }
        };

        return $this->mutations->run(
            $request,
            $request->method() === 'POST' ? 'ponto.post' : 'ponto.put',
            $action,
        );
    }
}
