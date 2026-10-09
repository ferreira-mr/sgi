<?php

declare(strict_types=1);

namespace App\Modules\Competicoes\Presentation\Http;

use App\Modules\Competicoes\Application\EquipeLimiteException;
use App\Modules\Competicoes\Application\EquipeNaoEncontradaException;
use App\Modules\Competicoes\Application\EquipeService;
use App\Modules\Competicoes\Infrastructure\MysqliEquipeGateway;
use App\Shared\Http\AccessGuard;
use App\Shared\Http\Request;
use App\Shared\Http\Response;

final class EquipeController
{
    public function __construct(
        private readonly EquipeService $service,
        private readonly MysqliEquipeGateway $queries,
    ) {
    }

    public function __invoke(Request $request): Response
    {
        $levels = match ($request->method()) {
            'GET' => [0, 1, 2, 3],
            'DELETE' => [0],
            default => [0, 1],
        };
        if (($denied = AccessGuard::authorize($levels)) !== null) {
            return $denied;
        }
        try {
            $data = $request->allInput();
            switch ($request->method()) {
                case 'GET':
                    $filters = $request->allQuery();
                    if ((int) ($_SESSION['nivel'] ?? -1) === 2) {
                        if ((int) ($_SESSION['id_interclasse'] ?? 0) <= 0) {
                            return Response::json(['success' => false, 'message' => 'Nenhuma edição ativa.'], 403);
                        }
                        $filters['id_interclasse'] = (int) ($_SESSION['id_interclasse'] ?? 0);
                    }
                    return Response::json($this->queries->list($filters));
                case 'POST':
                    return $this->createOrManage($data);
                case 'PUT':
                    $this->service->atualizar($data);
                    return Response::json(['success' => true, 'message' => 'Equipe atualizada com sucesso!']);
                case 'DELETE':
                    $this->service->excluir((int) ($data['id_equipe'] ?? $request->query('id_equipe', 0)));
                    return Response::json(['success' => true, 'message' => 'Equipe excluída com sucesso!']);
                default:
                    return Response::json(['message' => 'Método não permitido'], 405);
            }
        } catch (EquipeNaoEncontradaException) {
            return Response::json(['success' => false, 'message' => 'Equipe não encontrada.'], 404);
        } catch (EquipeLimiteException|\InvalidArgumentException $exception) {
            return Response::json(['success' => false, 'message' => $exception->getMessage()], 400);
        } catch (\Throwable $exception) {
            error_log('Falha ao processar equipe: ' . $exception->getMessage());
            return Response::json(['success' => false, 'message' => 'Não foi possível processar a equipe.'], 500);
        }
    }

    /** @param array<string, mixed> $data */
    private function createOrManage(array $data): Response
    {
        switch ((string) ($data['acao'] ?? '')) {
            case 'criar_equipe':
                $created = $this->service->criar($data);
                return Response::json(['success' => true, 'message' => 'Equipe criada com sucesso!', 'id_equipe' => $created['id_equipe'], 'nome_equipe' => $created['nome_equipe']]);
            case 'adicionar_usuarios':
                if (!array_key_exists('id_equipe', $data) || !isset($data['usuarios']) || !is_array($data['usuarios'])) {
                    return Response::json(['success' => false, 'message' => 'ID da equipe e lista de IDs de usuários são obrigatórios.'], 400);
                }
                $this->service->adicionarUsuarios((int) $data['id_equipe'], $data['usuarios']);
                return Response::json(['success' => true, 'message' => 'Usuários vinculados à equipe com sucesso!']);
            case 'remover_aluno':
                $this->service->removerUsuario((int) ($data['id_equipe'] ?? 0), (int) ($data['id_usuario'] ?? 0));
                return Response::json(['success' => true, 'message' => 'Estudante removido da equipe com sucesso!']);
            case 'redistribuir':
                $modality = (int) ($data['modalidades_id_modalidade'] ?? 0);
                $class = (int) ($data['turmas_id_turma'] ?? 0);
                if ($modality <= 0 || $class <= 0) {
                    return Response::json(['success' => false, 'message' => 'modalidades_id_modalidade e turmas_id_turma são obrigatórios.'], 400);
                }
                $result = $this->queries->redistribute($modality, $class);
                return Response::json($result, $result['success'] ? 200 : 400);
            default:
                return Response::json(['success' => false, 'message' => 'Ação inválida ou não informada.'], 400);
        }
    }

    public function generate(Request $request): Response
    {
        if ($request->method() === 'OPTIONS') {
            return Response::empty();
        }
        if (($denied = AccessGuard::authorize([0, 1])) !== null) {
            return $denied;
        }
        $edition = (int) $request->input('id_interclasse', 0);
        if ($edition <= 0) {
            return Response::json(['success' => false, 'message' => 'O ID do interclasse é obrigatório.'], 400);
        }
        try {
            $result = $this->queries->generate($edition);
            return Response::json(['success' => true, 'message' => 'Processamento concluído.', 'equipes_criadas' => $result['criadas'], 'erros' => $result['erros']]);
        } catch (\Throwable $exception) {
            error_log('Falha ao gerar equipes padrão: ' . $exception->getMessage());
            return Response::json(['success' => false, 'message' => 'Não foi possível gerar as equipes padrão.'], 500);
        }
    }
}
