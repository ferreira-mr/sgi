<?php

declare(strict_types=1);

namespace App\Modules\Competicoes\Presentation\Http;

use App\Modules\Acesso\Presentation\Http\CompetitionAccess;
use App\Modules\Competicoes\Application\CronometroService;
use App\Modules\Competicoes\Application\JogoConflitoException;
use App\Modules\Competicoes\Application\JogoService;
use App\Modules\Competicoes\Infrastructure\MysqliJogoGateway;
use App\Modules\Sincronizacao\Presentation\Http\MutationAction;
use App\Shared\Http\AccessGuard;
use App\Shared\Http\Request;
use App\Shared\Http\Response;

final class JogoController
{
    public function __construct(
        private readonly JogoService $service,
        private readonly MysqliJogoGateway $queries,
        private readonly CompetitionAccess $access,
        private readonly CronometroService $cronometro,
        private readonly MutationAction $mutations,
    ) {
    }

    public function __invoke(Request $request): Response
    {
        if ($request->method() === 'GET') {
            if (($denied = AccessGuard::authorize([0, 1, 2, 3])) !== null) {
                return $denied;
            }
            try {
                $filters = $request->allQuery();
                $nivel = (int) ($_SESSION['nivel'] ?? -1);
                $visao = $filters['visao'] ?? '';
                if (!is_string($visao)) {
                    return Response::json(['success' => false, 'message' => 'Visão de jogos inválida.'], 400);
                }
                if ($visao !== '' && $visao !== 'chaveamento') {
                    return Response::json(['success' => false, 'message' => 'Visão de jogos inválida.'], 400);
                }
                unset($filters['visao']);
                if ($visao === 'chaveamento') {
                    unset($filters['operacional']);
                }
                if ($visao === 'chaveamento' && $nivel === 3) {
                    return Response::json(['success' => false, 'message' => 'Alunos não podem consultar este histórico.'], 403);
                }
                if ($nivel === 2) {
                    if (($denied = $this->access->authorize()) !== null) {
                        return $denied;
                    }
                    $filters['operacional'] = $visao === 'chaveamento' ? 0 : 1;
                    $filters['id_interclasse'] = (int) ($this->access->context()->edicaoAtivaId ?? 0);
                }
                return Response::json($this->queries->list($filters));
            } catch (\Throwable $exception) {
                error_log('Falha ao listar jogos: ' . $exception->getMessage());
                return Response::json(['success' => false, 'message' => 'Não foi possível consultar jogos.'], 500);
            }
        }
        if (($denied = $this->access->authorize()) !== null) {
            return $denied;
        }
        if ($request->method() === 'POST') {
            if ((int) ($_SESSION['nivel'] ?? -1) === 2) {
                return Response::json([
                    'success' => false,
                    'message' => 'Mesários não podem criar ou agendar jogos manualmente.',
                ], 403);
            }
            try {
                $data = $request->allInput();
                if (!$this->resourceBelongsToActiveEdition((int) ($data['modalidades_id_modalidade'] ?? 0), false)) {
                    return Response::json(['success' => false, 'message' => 'O jogo não pertence à edição ativa.'], 403);
                }
                $id = $this->service->agendar($data);
                return Response::json(['success' => true, 'message' => 'Jogo cadastrado com sucesso!', 'id' => $id, 'id_jogo' => $id], 201);
            } catch (JogoConflitoException $exception) {
                return Response::json(['success' => false, 'message' => $exception->getMessage()], 422);
            } catch (\InvalidArgumentException $exception) {
                return Response::json(['success' => false, 'message' => $exception->getMessage()], 400);
            } catch (\Throwable $exception) {
                error_log('Falha ao criar jogo: ' . $exception->getMessage());
                return Response::json(['success' => false, 'message' => 'Não foi possível criar jogo.'], 500);
            }
        }
        if ($request->method() === 'PUT') {
            $data = $request->allInput();
            $id = (int) ($data['id_jogo'] ?? 0);
            if ($id < 0) {
                if ((int) ($_SESSION['nivel'] ?? -1) === 2 && $this->isScheduleMutation($data)) {
                    return Response::json(['success' => false, 'message' => 'Mesários não podem alterar a programação dos jogos.'], 403);
                }
                return Response::json(['success' => true, 'offline' => true, 'message' => 'Jogo temporário offline registrado.']);
            }
            if ($id <= 0) {
                return Response::json(['success' => false, 'message' => 'O ID do jogo é obrigatório.'], 400);
            }
            if (!$this->resourceBelongsToActiveEdition($id, true)) {
                return Response::json(['success' => false, 'message' => 'O jogo não pertence à edição ativa.'], 403);
            }
            if ((int) ($_SESSION['nivel'] ?? -1) === 2
                && $this->isScheduleMutation($data)) {
                return Response::json(['success' => false, 'message' => 'Mesários só podem alterar o status ou placar do jogo.'], 403);
            }
            if ($this->isCronometroMutation($data) && $this->isScheduleMutation($data)) {
                return Response::json([
                    'success' => false,
                    'message' => 'Atualizações de agenda e cronômetro devem ser enviadas separadamente.',
                ], 422);
            }
            try {
                if ($this->isCronometroMutation($data)) {
                    return $this->mutations->run($request, 'jogos.put', function () use ($id, $data): Response {
                        $result = $this->cronometro->atualizar($id, $data);
                        return Response::json(array_merge([
                            'success' => true,
                            'message' => 'Jogo atualizado com sucesso!',
                        ], $this->cronometro->response($result)));
                    });
                }
                if (!$this->queries->update($id, $data)) {
                    return Response::json(['success' => true, 'offline' => true, 'message' => 'Jogo temporário registrado localmente.']);
                }
                return Response::json(['success' => true, 'message' => 'Jogo atualizado com sucesso!']);
            } catch (JogoConflitoException $exception) {
                return Response::json(['success' => false, 'message' => $exception->getMessage()], 422);
            } catch (\InvalidArgumentException $exception) {
                return Response::json(['success' => false, 'message' => $exception->getMessage()], 422);
            } catch (\Throwable $exception) {
                error_log('Falha ao atualizar jogo: ' . $exception->getMessage());
                return Response::json(['success' => false, 'message' => 'Não foi possível atualizar jogo.'], 500);
            }
        }
        return Response::json(['success' => false, 'message' => 'Método não permitido'], 405);
    }

    /** @param array<string,mixed> $data */
    private function isCronometroMutation(array $data): bool
    {
        if (array_key_exists('cronometro', $data)
            || array_key_exists('tempo_restante_jogo', $data)
            || array_key_exists('tempo_extra_jogo', $data)
            || array_key_exists('duracao_jogo', $data)) {
            return true;
        }

        // Agendado/Aguardando são estados da agenda. Somente uma transição
        // explícita para um estado de operação do relógio deve passar pelo
        // CronometroService; caso contrário, o status atual enviado pelo
        // formulário de agenda seria confundido com uma mutação do timer.
        return array_key_exists('status_jogo', $data)
            && in_array($data['status_jogo'], ['Iniciado', 'Pausado', 'Concluido', 'Finalizado'], true);
    }

    /** @param array<string,mixed> $data */
    private function isScheduleMutation(array $data): bool
    {
        foreach (['nome_jogo', 'data_jogo', 'inicio_jogo', 'termino_jogo', 'modalidades_id_modalidade', 'locais_id_local'] as $field) {
            if (array_key_exists($field, $data)) {
                return true;
            }
        }

        return false;
    }

    private function resourceBelongsToActiveEdition(int $id, bool $game): bool
    {
        if ((int) ($_SESSION['nivel'] ?? -1) !== 2) {
            return true;
        }
        $active = (int) ($_SESSION['id_interclasse'] ?? 0);
        if ($active <= 0 || $id <= 0) {
            return false;
        }
        $edition = $game ? $this->queries->editionOfGame($id) : $this->queries->editionOfModality($id);
        return $edition !== null && $edition === $active;
    }
}
