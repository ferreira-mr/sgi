<?php

declare(strict_types=1);

namespace App\Modules\Disciplina\Presentation\Http;

use App\Modules\Acesso\Presentation\Http\CompetitionAccess;
use App\Modules\Competicoes\Domain\ChaveamentoRules;
use App\Modules\Disciplina\Application\OcorrenciaService;
use App\Modules\Disciplina\Domain\AutomaticOccurrenceConflict;
use App\Modules\Disciplina\Domain\OcorrenciaDescricao;
use App\Modules\Disciplina\Infrastructure\MysqliOcorrenciaQueries;
use App\Modules\Sincronizacao\Presentation\Http\MutationAction;
use App\Shared\Http\AccessGuard;
use App\Shared\Http\Request;
use App\Shared\Http\Response;

final class OcorrenciaController
{
    public function __construct(
        private readonly OcorrenciaService $service,
        private readonly MysqliOcorrenciaQueries $queries,
        private readonly CompetitionAccess $access,
        private readonly MutationAction $mutations,
    ) {
    }

    public function __invoke(Request $request): Response
    {
        if (($denied = AccessGuard::authorize([0, 1, 2, 3])) !== null) {
            return $denied;
        }
        try {
            if ($request->method() === 'GET') {
                $filters = $request->allQuery();
                $level = (int) ($_SESSION['nivel'] ?? -1);
                if (($filters['acao'] ?? '') === 'listar_atletas') {
                    if ($level === 3) {
                        return Response::json(['success' => false, 'message' => 'Consulta não disponível para competidores.'], 403);
                    }
                    if ($level === 2) {
                        $activeEdition = $this->access->context()->edicaoAtivaId;
                        $classEdition = $this->service->editionOfTurma((int) ($filters['id_turma'] ?? 0));
                        $gameId = (int) ($filters['id_jogo'] ?? 0);
                        $gameEdition = $gameId > 0 ? $this->service->editionOfGame($gameId) : null;
                        if ($activeEdition === null
                            || $classEdition !== $activeEdition
                            || ($gameId > 0 && $gameEdition !== $activeEdition)) {
                            return Response::json(['success' => false, 'message' => 'Recurso fora da edição ativa.'], 403);
                        }
                    }
                }
                if ($level === 2) {
                    if (($denied = $this->access->authorize()) !== null) {
                        return $denied;
                    }
                    $filters['_scope_interclasse'] = $this->access->context()->edicaoAtivaId;
                } elseif ($level === 3) {
                    $filters['_scope_usuario'] = (int) ($_SESSION['id_usuario'] ?? $_SESSION['id'] ?? 0);
                }
                return Response::json($this->queries->list($filters));
            }
            if (($denied = $this->access->authorize()) !== null) {
                return $denied;
            }
            if ($request->method() === 'POST') {
                return $this->mutations->run($request, 'ocorrencias.post', function () use ($request): Response {
                    $data = $request->allInput();
                    if (!isset($data['titulo_ocorrencia'], $data['descricao_ocorrencia'], $data['data_ocorrencia'], $data['usuarios_id_usuario'])) {
                        return Response::json(['success' => false, 'message' => 'Dados incompletos.'], 400);
                    }
                    try {
                        $submittedDescription = OcorrenciaDescricao::parseSubmitted(
                            (string) $data['descricao_ocorrencia'],
                            true,
                        );
                    } catch (\InvalidArgumentException $exception) {
                        return Response::json(['success' => false, 'message' => $exception->getMessage()], 422);
                    }
                    $game = (int) ($data['id_jogo'] ?? 0);
                    if ($game < 0) {
                        $tag = trim((string) ($data['nome_jogo'] ?? ''));
                        $edition = $this->queries->editionOfModality((int) ($data['id_modalidade'] ?? 0));
                        if ($edition === null) {
                            return Response::json(['success' => false, 'message' => 'Modalidade não encontrada.'], 404);
                        }
                        if (ChaveamentoRules::parse($tag) === null) {
                            return Response::json(['success' => false, 'message' => 'A tag do jogo temporário é inválida.'], 422);
                        }
                        if (($denied = $this->access->authorize($edition)) !== null) {
                            return $denied;
                        }
                    }
                    $resolved = $this->queries->resolveGame($game, (string) ($data['nome_jogo'] ?? ''), (int) ($data['id_modalidade'] ?? 0));
                    if ($game < 0 && $resolved <= 0) {
                        return Response::json(['success' => false, 'message' => 'A partida temporária ainda não foi materializada. O registro continuará na fila para evitar perda de dados.'], 409);
                    }
                    $structuredGame = $resolved > 0 ? $resolved : 0;
                    $descriptionGame = $submittedDescription['gameId'];
                    if ($descriptionGame < 0) {
                        if ($game >= 0 || $descriptionGame !== $game || $structuredGame <= 0) {
                            return Response::json(['success' => false, 'message' => 'A referência textual do jogo não pode ser resolvida.'], 422);
                        }
                        $descriptionGame = $structuredGame;
                    }
                    if ($structuredGame > 0 && $descriptionGame > 0 && $descriptionGame !== $structuredGame) {
                        return Response::json(['success' => false, 'message' => 'A descrição não pode substituir o jogo informado.'], 422);
                    }
                    $effectiveGame = $structuredGame > 0 ? $structuredGame : $descriptionGame;
                    $structuredClass = (int) ($data['id_turma'] ?? 0);
                    if ($structuredClass > 0 && $submittedDescription['classId'] > 0
                        && $submittedDescription['classId'] !== $structuredClass) {
                        return Response::json(['success' => false, 'message' => 'A descrição não pode substituir a turma informada.'], 422);
                    }
                    $effectiveClass = $structuredClass > 0 ? $structuredClass : $submittedDescription['classId'];
                    if (($denied = $this->authorizeReferences(
                        (int) $data['usuarios_id_usuario'],
                        $effectiveGame,
                        $effectiveClass,
                    )) !== null) {
                        return $denied;
                    }
                    $data['id_jogo'] = $effectiveGame;
                    $data['id_turma'] = $effectiveClass;
                    $data['descricao_ocorrencia'] = $submittedDescription['text'];
                    $result = $this->service->registrar($data);
                    $payload = ['success' => true, 'message' => 'Ocorrência registrada com sucesso!', 'id' => $result['id']];
                    if ($result['evento'] !== null) {
                        $payload['evento'] = $result['evento'];
                    }
                    return Response::json($payload, 201);
                });
            }
            if ($request->method() === 'PUT') {
                return $this->mutations->run($request, 'ocorrencias.put', function () use ($request): Response {
                    $data = $request->allInput();
                    $id = (int) ($data['id_ocorrencia'] ?? 0);
                    $existing = $this->service->encontrar($id);
                    if ($existing === null) {
                        return Response::json(['success' => false, 'message' => 'Ocorrência não encontrada.'], 404);
                    }
                    if ((int) ($existing['automatico_derivado'] ?? 0) === 1) {
                        return Response::json(['success' => false, 'message' => 'Vermelho automático é atualizado pelos cartões amarelos de origem.'], 409);
                    }
                    $references = $this->queries->referencesFromDescription((string) $existing['descricao_ocorrencia']);
                    if (($denied = $this->authorizeReferences(
                        (int) $existing['usuarios_id_usuario'],
                        $references['gameId'],
                        $references['classId'],
                    )) !== null) {
                        return $denied;
                    }
                    if (array_key_exists('id_jogo', $data)
                        && (int) $data['id_jogo'] !== $references['gameId']) {
                        return Response::json(['success' => false, 'message' => 'O jogo da ocorrência não pode ser trocado por outro recurso.'], 422);
                    }
                    if (array_key_exists('id_turma', $data)
                        && (int) $data['id_turma'] !== $references['classId']) {
                        return Response::json(['success' => false, 'message' => 'A turma da ocorrência não pode ser trocada por outro recurso.'], 422);
                    }
                    if (array_key_exists('descricao_ocorrencia', $data)) {
                        try {
                            $submittedDescription = OcorrenciaDescricao::parseSubmitted(
                                (string) $data['descricao_ocorrencia'],
                            );
                        } catch (\InvalidArgumentException $exception) {
                            return Response::json(['success' => false, 'message' => $exception->getMessage()], 422);
                        }
                        $data['descricao_ocorrencia'] = $submittedDescription['text'];
                    }
                    $this->service->atualizar($data);
                    return Response::json(['success' => true, 'message' => 'Ocorrência atualizada com sucesso!']);
                });
            }
            return Response::json(['success' => false, 'message' => 'Método não permitido'], 405);
        } catch (\InvalidArgumentException $exception) {
            return Response::json(['success' => false, 'message' => $exception->getMessage()], 400);
        } catch (AutomaticOccurrenceConflict $exception) {
            return Response::json(['success' => false, 'message' => $exception->getMessage()], 409);
        } catch (\Throwable $exception) {
            error_log('Falha ao processar ocorrência: ' . $exception->getMessage());
            return Response::json(['success' => false, 'message' => $request->method() === 'PUT' ? 'Não foi possível atualizar ocorrência.' : 'Não foi possível registrar ocorrência.'], 500);
        }
    }

    private function authorizeReferences(int $userId, int $gameId, int $classId): ?Response
    {
        $gameEdition = null;
        if ($gameId > 0) {
            $gameEdition = $this->service->editionOfGame($gameId);
            if ($gameEdition === null) {
                return Response::json(['success' => false, 'message' => 'Jogo não encontrado.'], 404);
            }
            if (($denied = $this->access->authorize($gameEdition)) !== null) {
                return $denied;
            }
        }

        $role = $this->service->roleOfUser($userId);
        if ($role === null) {
            return Response::json(['success' => false, 'message' => 'Estudante não encontrado.'], 404);
        }
        $userEdition = $this->service->editionOfUser($userId);
        $edition = $gameEdition ?? $userEdition;
        if ($edition === null) {
            if (!in_array($role, [0, 1], true)) {
                return Response::json(['success' => false, 'message' => 'A edição do estudante não foi encontrada.'], 404);
            }
            if (($denied = $this->access->authorize()) !== null) {
                return $denied;
            }
        } elseif ($gameEdition === null && ($denied = $this->access->authorize($edition)) !== null) {
            return $denied;
        }

        if ($role === 3) {
            if ($userEdition === null || ($gameEdition !== null && $userEdition !== $gameEdition)) {
                return Response::json(['success' => false, 'message' => 'Estudante e ocorrência não pertencem à mesma edição.'], 422);
            }
            if ($gameId > 0 && !$this->service->userParticipatesInGame($userId, $gameId)) {
                return Response::json(['success' => false, 'message' => 'Estudante não participa deste jogo.'], 422);
            }
        }

        if ($classId > 0) {
            $classEdition = $this->service->editionOfTurma($classId);
            if ($classEdition === null) {
                return Response::json(['success' => false, 'message' => 'Turma não encontrada.'], 404);
            }
            if ($edition !== null && $classEdition !== $edition) {
                return Response::json(['success' => false, 'message' => 'A turma não pertence à edição da ocorrência.'], 422);
            }
            if ($gameId > 0 && !$this->service->gameContainsTurma($gameId, $classId)) {
                return Response::json(['success' => false, 'message' => 'A turma não participa deste jogo.'], 422);
            }
            if ($role === 3 && !$this->service->userBelongsToTurma($userId, $classId)) {
                return Response::json(['success' => false, 'message' => 'O estudante não pertence à turma informada.'], 422);
            }
        }

        return null;
    }
}
