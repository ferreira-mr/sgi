<?php

declare (strict_types=1);

namespace App\Modules\Acesso\Presentation\Http;

use App\Modules\Acesso\Application\TermosService;

final class TermosController
{
    public function __construct(private readonly TermosService $service)
    {
    }
    public function __invoke(\App\Shared\Http\Request $request): \App\Shared\Http\Response
    {
        $status = 200;
        $headers = [];
        $query = $request->allQuery();
        $post = $request->allInput();
        $headers['Content-Type'] = 'application/json; charset=utf-8';
        if (($denied = \App\Shared\Http\AccessGuard::authorize([3])) !== null) {
            return $denied;
        }
        \App\Shared\Http\SessionManager::start();
        $idUsuario = (int) ($_SESSION['id_usuario'] ?? $_SESSION['id'] ?? $_SESSION['usuario_id'] ?? 0);
        $service = $this->service;
        $method = $request->method();
        try {
            if ($method === 'GET') {
                $result = $service->consultar($idUsuario);
                if ($result === null) {
                    return \App\Shared\Http\Response::json(['success' => false, 'message' => 'Estudante não cadastrado.'], $status, $headers);
                }
                return \App\Shared\Http\Response::json(['success' => true, ...$result], $status, $headers);
            }
            if ($method === 'POST') {
                $result = $service->aceitar($idUsuario);
                $response = match ($result['status']) {
                    'accepted' => ['success' => true, 'message' => 'Termos aceitos com sucesso!', 'exige_troca_senha' => $result['exige_troca_senha'] ?? false],
                    'already_accepted' => ['success' => true, 'message' => 'Usuário já aceitou os termos.', 'exige_troca_senha' => $result['exige_troca_senha'] ?? false],
                    'no_edition' => ['success' => false, 'message' => 'Estudante não possui um Interclasse vinculado e não há edição ativa.'],
                    default => ['success' => false, 'message' => 'Estudante não cadastrado.'],
                };
                return \App\Shared\Http\Response::json($response, $status, $headers);
            }
            $status = 405;
            return \App\Shared\Http\Response::json(['success' => false, 'message' => 'Método não permitido.'], $status, $headers);
        } catch (\InvalidArgumentException $exception) {
            $status = 401;
            return \App\Shared\Http\Response::json(['success' => false, 'message' => $exception->getMessage()], $status, $headers);
        } catch (\Throwable $exception) {
            error_log('Falha ao registrar aceite de termos: ' . $exception->getMessage());
            $status = 500;
            return \App\Shared\Http\Response::json(['success' => false, 'message' => 'Não foi possível processar os termos.'], $status, $headers);
        }
    }
}
