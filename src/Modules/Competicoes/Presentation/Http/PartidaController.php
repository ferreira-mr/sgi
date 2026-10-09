<?php

declare(strict_types=1);

namespace App\Modules\Competicoes\Presentation\Http;

use App\Modules\Acesso\Presentation\Http\CompetitionAccess;
use App\Modules\Competicoes\Application\PartidaService;
use App\Modules\Competicoes\Infrastructure\MysqliPartidaGateway;
use App\Shared\Http\AccessGuard;
use App\Shared\Http\Request;
use App\Shared\Http\Response;

final class PartidaController
{
    public function __construct(
        private readonly PartidaService $service,
        private readonly MysqliPartidaGateway $queries,
        private readonly CompetitionAccess $access,
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
                if ((int) ($_SESSION['nivel'] ?? -1) === 2) {
                    if ((int) ($_SESSION['id_interclasse'] ?? 0) <= 0) {
                        return Response::json(['success' => false, 'message' => 'Nenhuma edição ativa.'], 403);
                    }
                    $filters['id_interclasse'] = (int) ($_SESSION['id_interclasse'] ?? 0);
                }
                return Response::json($this->queries->list($filters));
            } catch (\Throwable $exception) {
                error_log('Falha ao listar partidas: ' . $exception->getMessage());
                return Response::json(['success' => false, 'message' => 'Não foi possível consultar partidas.'], 500);
            }
        }
        $data = $request->allInput();
        $id = $data['id_partida'] ?? null;
        $partidaPrevia = null;
        if ((int) ($_SESSION['nivel'] ?? -1) === 2 && is_numeric($id) && (int) $id > 0) {
            $partidaPrevia = $this->service->encontrar((int) $id);
            if ($partidaPrevia !== null
                && ($denied = $this->access->authorize((int) ($partidaPrevia['edition_id'] ?? 0))) !== null) {
                return $denied;
            }
        }
        if (($denied = $this->access->authorize()) !== null) {
            return $denied;
        }
        if ($request->method() === 'POST') {
            if (array_key_exists('resultado_final', $data) || array_key_exists('resultado_partida', $data)) {
                return Response::json([
                    'success' => false,
                    'message' => 'O placar só pode ser alterado por uma jogada vinculada a um estudante.',
                ], 422);
            }
            if (!is_numeric($id) || (int) $id <= 0) {
                return Response::json(['success' => true, 'offline' => true, 'message' => 'Partida temporária sincronizada']);
            }
            if (!array_key_exists('resultado_final', $data)) {
                return Response::json(['success' => false, 'message' => 'Dados incompletos.'], 400);
            }
            $partida = $partidaPrevia ?? $this->service->encontrar((int) $id);
            if ($partida === null) {
                return Response::json(['success' => false, 'message' => 'Partida não encontrada.'], 404);
            }
            $gameId = (int) ($partida['jogos_id_jogo'] ?? 0);
            $teamId = (int) ($partida['equipes_id_equipe'] ?? 0);
            if (($denied = $this->access->authorize((int) ($partida['edition_id'] ?? 0))) !== null) {
                return $denied;
            }
            if (($invalid = $this->rejectDiscordantIdentifiers($data, $gameId, $teamId)) !== null) {
                return $invalid;
            }
            $results = $this->queries->scoresOfGame($gameId);
            $targetFound = false;
            foreach ($results as &$result) {
                if ($result['id_equipe'] !== $teamId) {
                    continue;
                }
                $result['gols'] = (int) $data['resultado_final'];
                $targetFound = true;
                break;
            }
            unset($result);
            if (!$targetFound) {
                return Response::json(['success' => false, 'message' => 'Partida não pertence ao jogo persistido.'], 422);
            }
            try {
                $this->queries->launch(
                    $gameId,
                    null,
                    0,
                    $results,
                    [],
                    (int) ($_SESSION['id_usuario'] ?? $_SESSION['id'] ?? 0),
                );
                return Response::json(['success' => true, 'message' => 'Resultado salvo e jogo finalizado!']);
            } catch (\InvalidArgumentException $exception) {
                return Response::json(['success' => false, 'message' => $exception->getMessage()], 422);
            } catch (\Throwable $exception) {
                error_log('Falha ao atualizar resultado da partida: ' . $exception->getMessage());
                return Response::json(['success' => false, 'message' => 'Não foi possível atualizar a partida.'], 500);
            }
        }
        if ($request->method() === 'PUT') {
            if (array_key_exists('resultado_partida', $data)) {
                return Response::json([
                    'success' => false,
                    'message' => 'O placar só pode ser alterado por uma jogada vinculada a um estudante.',
                ], 422);
            }
            if (!is_numeric($id) || (int) $id <= 0) {
                return Response::json(['success' => true, 'offline' => true, 'message' => 'Partida temporária sincronizada']);
            }
            $partida = $partidaPrevia ?? $this->service->encontrar((int) $id);
            if ($partida === null) {
                return Response::json(['success' => false, 'message' => 'Partida não encontrada.'], 404);
            }
            $gameId = (int) ($partida['jogos_id_jogo'] ?? 0);
            $teamId = (int) ($partida['equipes_id_equipe'] ?? 0);
            if (($denied = $this->access->authorize((int) ($partida['edition_id'] ?? 0))) !== null) {
                return $denied;
            }
            if (($invalid = $this->rejectDiscordantIdentifiers($data, $gameId, $teamId)) !== null) {
                return $invalid;
            }
            if (array_key_exists('resultado_partida', $data)
                && in_array((string) ($partida['status_jogo'] ?? ''), ['Concluido', 'Finalizado'], true)) {
                return Response::json([
                    'success' => false,
                    'message' => 'Partidas encerradas só podem ser retificadas pelo lançamento completo do resultado.',
                ], 422);
            }
            $data['jogos_id_jogo'] ??= $gameId;
            $data['equipes_id_equipe'] ??= $teamId;
            try {
                $this->service->atualizar($data);
                return Response::json(['success' => true, 'message' => 'Partida atualizada com sucesso!']);
            } catch (\InvalidArgumentException $exception) {
                return Response::json(['success' => false, 'message' => $exception->getMessage()], 400);
            } catch (\Throwable $exception) {
                error_log('Falha ao atualizar partida: ' . $exception->getMessage());
                return Response::json(['success' => false, 'message' => 'Não foi possível atualizar a partida.'], 500);
            }
        }
        return Response::json(['message' => 'Método não permitido'], 405);
    }

    /** @param array<string, mixed> $data */
    private function rejectDiscordantIdentifiers(array $data, int $gameId, int $teamId): ?Response
    {
        foreach ([
            'jogos_id_jogo' => [$gameId, 'jogo'],
            'equipes_id_equipe' => [$teamId, 'equipe'],
        ] as $field => [$expected, $label]) {
            if (!array_key_exists($field, $data) || !is_numeric($data[$field])) {
                continue;
            }
            if ((int) $data[$field] !== $expected) {
                return Response::json([
                    'success' => false,
                    'message' => "O {$label} da partida não pode ser alterado.",
                ], 422);
            }
        }
        return null;
    }
}
