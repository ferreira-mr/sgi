<?php

declare (strict_types=1);

namespace App\Modules\Resultados\Presentation\Http;

use App\Modules\Resultados\Application\ArrecadacaoHistoricoJaRemovidoException;
use App\Modules\Resultados\Application\ArrecadacaoHistoricoNaoEncontradoException;
use App\Modules\Resultados\Application\ArrecadacaoService;
use App\Modules\Resultados\Domain\ArrecadacaoQuantidadeInsuficienteException;
use App\Modules\Sincronizacao\Presentation\Http\MutationAction;

final class ArrecadacaoController
{
    public function __construct(
        private readonly ArrecadacaoService $service,
        private readonly MutationAction $mutations,
    ) {
    }
    public function __invoke(\App\Shared\Http\Request $request): \App\Shared\Http\Response
    {
        $status = 200;
        $headers = [];
        $query = $request->allQuery();
        $post = $request->allInput();
        $headers['Content-Type'] = 'application/json; charset=utf-8';
        $service = $this->service;
        $method = $request->method();
        if ($method === 'OPTIONS') {
            $status = 204;
            return \App\Shared\Http\Response::empty($status, $headers);
        }
        if (($denied = \App\Shared\Http\AccessGuard::authorize([0, 1, 2, 3])) !== null) {
            return $denied;
        }
        try {
            switch ($method) {
                case 'GET':
                    if (($denied = \App\Shared\Http\AccessGuard::authorize([0, 1])) !== null) {
                        return $denied;
                    }
                    return \App\Shared\Http\Response::json($service->listar((int) ($query['id_interclasse'] ?? 0)), $status, $headers);
                case 'POST':
                    if (($denied = \App\Shared\Http\AccessGuard::authorize([0, 1])) !== null) {
                        return $denied;
                    }
                    return $this->mutations->run($request, 'arrecadacao.post', function () use ($request, $service, $status, $headers): \App\Shared\Http\Response {
                        \App\Shared\Http\SessionManager::start();
                        $service->adicionarLote($request->allInput(), (int) ($_SESSION['id'] ?? 0));
                        return \App\Shared\Http\Response::json(['success' => true, 'message' => 'Pontuações somadas com sucesso!'], $status, $headers);
                    });
                case 'DELETE':
                    if (($denied = \App\Shared\Http\AccessGuard::authorize([0, 1])) !== null) {
                        return $denied;
                    }
                    return $this->mutations->run($request, 'arrecadacao.delete', function () use ($request, $service, $status, $headers): \App\Shared\Http\Response {
                        $payload = $request->allInput();
                        $service->remover((int) ($payload['id_historico'] ?? 0), (int) ($payload['id_interclasse'] ?? 0));
                        return \App\Shared\Http\Response::json(['success' => true, 'message' => 'Registro removido e pontos revertidos com sucesso!'], $status, $headers);
                    });
                default:
                    $status = 405;
                    return \App\Shared\Http\Response::json(['success' => false, 'message' => 'Método não permitido.'], $status, $headers);
            }
        } catch (\InvalidArgumentException $exception) {
            $status = 400;
            return \App\Shared\Http\Response::json(['success' => false, 'message' => $exception->getMessage()], $status, $headers);
        } catch (ArrecadacaoHistoricoNaoEncontradoException $exception) {
            $status = 404;
            return \App\Shared\Http\Response::json(['success' => false, 'message' => 'Registro não encontrado.'], $status, $headers);
        } catch (ArrecadacaoHistoricoJaRemovidoException $exception) {
            return \App\Shared\Http\Response::json(['success' => false, 'message' => 'Este registro já foi removido anteriormente.'], $status, $headers);
        } catch (ArrecadacaoQuantidadeInsuficienteException $exception) {
            return \App\Shared\Http\Response::json(['success' => false, 'message' => 'A quantidade arrecadada é insuficiente para o estorno.'], 409, $headers);
        } catch (\Throwable $exception) {
            error_log('Falha ao processar arrecadação: ' . $exception->getMessage());
            $status = 500;
            return \App\Shared\Http\Response::json(['success' => false, 'message' => 'Não foi possível processar a arrecadação.'], $status, $headers);
        }
    }
}
