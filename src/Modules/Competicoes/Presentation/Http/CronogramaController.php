<?php

declare(strict_types=1);

namespace App\Modules\Competicoes\Presentation\Http;

use App\Modules\Competicoes\Application\CronogramaService;
use App\Shared\Http\AccessGuard;
use App\Shared\Http\Request;
use App\Shared\Http\Response;

final class CronogramaController
{
    public function __construct(private readonly CronogramaService $service)
    {
    }

    public function __invoke(Request $request): Response
    {
        $data = $request->allInput();
        $edition = (int) ($data['id_interclasse'] ?? $request->query('id_interclasse', $_SESSION['id_interclasse'] ?? 0));
        if ($edition <= 0) {
            return Response::json(['success' => false, 'message' => 'O ID da edição é obrigatório.'], 422);
        }
        if ($request->method() === 'GET') {
            if (($denied = AccessGuard::authorize([0, 1, 2, 3])) !== null) {
                return $denied;
            }
            if (($denied = $this->authorizeEdition($edition)) !== null) {
                return $denied;
            }
            try {
                $action = (string) $request->query('acao', 'estado');
                if ($action === 'agenda_aluno') {
                    $userId = (int) ($_SESSION['id_usuario'] ?? $_SESSION['id'] ?? 0);
                    return Response::json($this->service->agendaAluno($edition, $userId, $this->teamIds($request)));
                }
                return Response::json($this->service->estado($edition));
            } catch (\InvalidArgumentException $exception) {
                $status = (string) $request->query('acao', 'estado') === 'agenda_aluno' ? 422 : 404;
                return Response::json(['success' => false, 'code' => 'CRONOGRAMA_INVALIDO', 'message' => $exception->getMessage()], $status);
            } catch (\Throwable $exception) {
                error_log('Falha ao consultar cronograma: ' . $exception->getMessage());
                return Response::json(['success' => false, 'message' => 'Não foi possível consultar o cronograma.'], 500);
            }
        }
        if (!in_array($request->method(), ['POST', 'PUT'], true)) {
            return Response::json(['success' => false, 'message' => 'Método não permitido.'], 405);
        }
        if (($denied = AccessGuard::authorize([0, 1])) !== null) {
            return $denied;
        }
        if (($denied = $this->authorizeEdition($edition)) !== null) {
            return $denied;
        }
        try {
            $userId = (int) ($_SESSION['id_usuario'] ?? $_SESSION['id'] ?? 0);
            $action = (string) ($data['acao'] ?? 'estado');
            $result = match ($action) {
                'preparar_equipes' => $this->service->preparar($edition, $userId),
                'gerar_rascunho' => $this->service->gerar($edition, $userId, $data),
                'publicar' => $this->service->publicar($edition, $userId, $data),
                'abrir_inscricoes' => $this->service->abrir($edition, $userId, $data),
                'encerrar_inscricoes' => $this->service->fechar($edition, $userId, $data),
                'liberar_operacao' => $this->service->liberar($edition, $userId, $data),
                'revisar' => $this->service->revisar($edition, $userId, $data),
                'materializar_no' => $this->service->materializar($edition, $userId, $data),
                default => throw new \InvalidArgumentException('Ação de cronograma inválida.'),
            };
            return Response::json($result);
        } catch (\InvalidArgumentException $exception) {
            return Response::json(['success' => false, 'code' => 'CRONOGRAMA_INVALIDO', 'message' => $exception->getMessage()], 422);
        } catch (\Throwable $exception) {
            error_log('Falha ao processar cronograma: ' . $exception->getMessage());
            return Response::json(['success' => false, 'code' => 'CRONOGRAMA_ERRO', 'message' => 'Não foi possível processar o cronograma.'], 500);
        }
    }

    private function authorizeEdition(int $edition): ?Response
    {
        $level = (int) ($_SESSION['nivel'] ?? -1);
        if (in_array($level, [2, 3], true) && (int) ($_SESSION['id_interclasse'] ?? 0) !== $edition) {
            return Response::json(['success' => false, 'message' => 'A edição solicitada não está disponível para esta sessão.'], 403);
        }
        return null;
    }

    /** @return list<int> */
    private function teamIds(Request $request): array
    {
        $raw = $request->query('id_equipes', $request->query('id_equipe', []));
        if (is_string($raw)) {
            $raw = preg_split('/[,;\s]+/', $raw, -1, PREG_SPLIT_NO_EMPTY) ?: [];
        } elseif (!is_array($raw)) {
            $raw = [$raw];
        }

        $ids = array_values(array_unique(array_filter(array_map('intval', $raw), static fn (int $id): bool => $id > 0)));
        if (count($ids) !== count($raw)) {
            throw new \InvalidArgumentException('A lista de equipes da agenda é inválida.');
        }
        return $ids;
    }
}
