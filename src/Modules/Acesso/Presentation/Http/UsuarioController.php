<?php

declare(strict_types=1);

namespace App\Modules\Acesso\Presentation\Http;

use App\Modules\Acesso\Application\UsuarioAdministrativoService;
use App\Modules\Acesso\Application\UsuarioService;
use App\Modules\Acesso\Domain\UsuarioConsultaRepository;
use App\Modules\Eventos\Application\EdicaoService;
use App\Modules\Eventos\Domain\EdicaoConsulta;
use App\Modules\Eventos\Domain\EdicaoRules;
use App\Shared\Http\AccessGuard;
use App\Shared\Http\Request;
use App\Shared\Http\Response;

final class UsuarioController
{
    public function __construct(
        private readonly UsuarioConsultaRepository $consultas,
        private readonly UsuarioService $usuarios,
        private readonly UsuarioAdministrativoService $administrative,
        private readonly EdicaoConsulta $edicoesConsulta,
        private readonly EdicaoService $edicoes,
    ) {
    }

    public function __invoke(Request $request): Response
    {
        $action = (string) $request->query('acao', $request->input('acao', ''));
        try {
            if ($request->method() === 'GET') {
                $level = (int) ($_SESSION['nivel'] ?? -1);
                $allowed = match ($action) {
                    'listar_competidores' => [0, 1, 2],
                    'listar_colaboradores', '' => [0],
                    default => [],
                };
                if (($denied = AccessGuard::authorize($allowed)) !== null) {
                    return $denied;
                }
                $edition = $this->edicoesConsulta->findActiveId();
                if ($edition === null) {
                    return Response::json(['status' => 'erro', 'mensagem' => 'Nenhuma edição ativa.']);
                }
                $requestedEdition = (int) $request->query('id_interclasse', $edition);
                // Mesários are strictly limited to the currently active edition;
                // the client cannot widen this scope with a query parameter.
                if ($level === 2 && $requestedEdition !== $edition) {
                    return Response::json(['status' => 'erro', 'mensagem' => 'Edição não autorizada.'], 403);
                }
                $effectiveEdition = $level === 2 ? $edition : $requestedEdition;
                return match ($action) {
                    'listar_competidores' => Response::json($this->consultas->competitors((int) $request->query('id_turma', 0), $effectiveEdition, (string) $request->query('genero', ''), $level !== 2)),
                    'listar_colaboradores' => Response::json($this->consultas->collaborators($edition)),
                    '' => Response::json($this->consultas->allUsers($edition)),
                    default => Response::json(['status' => 'erro', 'mensagem' => 'Ação inválida.'], 400),
                };
            }
            if ($request->method() === 'PUT') {
                if (($denied = AccessGuard::authorize([0, 1])) !== null) {
                    return $denied;
                }
                $data = $request->allInput();
                $this->edicoes->alterarStatus((int) ($data['id_interclasse'] ?? 0), (string) ($data['status_interclasse'] ?? ''));
                return Response::json(['status' => 'sucesso', 'mensagem' => 'Edição atualizada.']);
            }
            if ($request->method() !== 'POST') {
                return Response::json(['status' => 'erro', 'mensagem' => 'Método não permitido.'], 405);
            }
            $data = $request->allInput();
            if ($action === 'validar_inscricao') {
                // Matrícula + data de nascimento are not authentication factors.
                // This legacy endpoint must never create an authenticated session.
                return Response::json([
                    'status' => 'erro',
                    'mensagem' => 'Validação cadastral descontinuada. Use matrícula e senha para entrar.',
                ], 410);
            }
            if ($action === 'criar_aluno') {
                if (($denied = AccessGuard::authorize([0, 1])) !== null) {
                    return $denied;
                }
                $edition = $this->edicoesConsulta->findActiveId();
                if ($edition === null) {
                    return Response::json(['status' => 'erro', 'mensagem' => 'Nenhuma edição ativa.']);
                }
                return Response::json($this->usuarios->criarAluno($data, $edition));
            }
            if ($action === 'cadastrar_usuario') {
                if (($denied = AccessGuard::authorize([0])) !== null) {
                    return $denied;
                }
                $edition = $this->edicoesConsulta->findActiveId();
                if ($edition === null) {
                    return Response::json(EdicaoRules::erroSemInterclasseAtivo());
                }
                return Response::json($this->usuarios->cadastrarColaborador($data, $edition, self::temporaryPhotoPath($request->file('foto'))));
            }
            if ($action === 'atualizar_colaborador' || $action === 'atualizar_dados_colaborador') {
                if (($denied = AccessGuard::authorize([0])) !== null) {
                    return $denied;
                }
                $edition = $this->edicoesConsulta->findActiveId();
                if ($edition === null) {
                    return Response::json(EdicaoRules::erroSemInterclasseAtivo());
                }
                if ($action === 'atualizar_colaborador') {
                    $this->usuarios->atualizarColaborador($data, $edition);
                } else {
                    $this->usuarios->atualizarDadosColaborador(
                        $data,
                        $edition,
                        (int) ($_SESSION['id'] ?? $_SESSION['id_usuario'] ?? 0),
                    );
                }
                return Response::json(['status' => 'sucesso', 'mensagem' => 'Colaborador atualizado.']);
            }
            if ($action === 'editar_aluno') {
                if (($denied = AccessGuard::authorize([0, 1])) !== null) {
                    return $denied;
                }
                $edition = $this->edicoesConsulta->findActiveId();
                if ($edition === null) {
                    return Response::json(EdicaoRules::erroSemInterclasseAtivo());
                }
                $this->usuarios->editarAluno($data, $edition);
                return Response::json(['status' => 'sucesso', 'mensagem' => 'Estudante atualizado!']);
            }
            if (in_array($action, ['excluir_aluno', 'resetar_senha_aluno', 'excluir_colaborador'], true)) {
                if (($denied = AccessGuard::authorize([0])) !== null) {
                    return $denied;
                }
                $id = (int) ($data['id_usuario'] ?? 0);
                if ($action === 'excluir_aluno') {
                    $this->administrative->excluirAluno($id);
                    return Response::json(['status' => 'sucesso', 'mensagem' => 'Estudante removido.']);
                }
                if ($action === 'resetar_senha_aluno') {
                    $temporaryPassword = $this->administrative->resetarSenhaAluno($id);
                    return Response::json([
                        'status' => 'sucesso',
                        'mensagem' => 'Senha redefinida para sesi-senai. O estudante deverá trocá-la no próximo acesso.',
                        'senha_temporaria' => $temporaryPassword,
                    ]);
                }
                $this->administrative->excluirColaborador($id, $this->edicoesConsulta->findActiveId(), (int) ($_SESSION['id'] ?? $_SESSION['id_usuario'] ?? 0));
                return Response::json(['status' => 'sucesso', 'mensagem' => 'Colaborador removido.']);
            }
            if ($request->query('id', null) !== null) {
                if (($denied = AccessGuard::authorize([0, 1])) !== null) {
                    return $denied;
                }
                $edition = $this->edicoesConsulta->findActiveId();
                if ($edition === null) {
                    return Response::json(['status' => 'erro', 'mensagem' => 'Nenhuma edição ativa.']);
                }
                $requestedEdition = (int) ($data['interclasses_id_interclasse'] ?? $edition);
                if ($requestedEdition !== $edition) {
                    return Response::json(['status' => 'erro', 'mensagem' => 'Edição não autorizada.'], 403);
                }
                $this->usuarios->atribuirAluno((int) $request->query('id'), (int) ($data['turmas_id_turma'] ?? 0), $edition);
                return Response::json(['status' => 'sucesso', 'mensagem' => 'Estudante atualizado.']);
            }
            return Response::json(['status' => 'erro', 'mensagem' => 'Ação inválida.'], 400);
        } catch (\mysqli_sql_exception $exception) {
            error_log('Falha ao processar usuário: ' . $exception->getMessage());
            return Response::json(['status' => 'erro', 'mensagem' => 'Não foi possível processar usuário.'], 500);
        } catch (\InvalidArgumentException|\RuntimeException $exception) {
            return Response::json(['status' => 'erro', 'mensagem' => $exception->getMessage()], 400);
        } catch (\Throwable $exception) {
            error_log('Falha ao processar usuário: ' . $exception->getMessage());
            return Response::json(['status' => 'erro', 'mensagem' => 'Não foi possível processar usuário.'], 500);
        }
    }

    /** @param mixed $file */
    private static function temporaryPhotoPath(mixed $file): ?string
    {
        if (!is_array($file) || (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            return null;
        }

        $path = $file['tmp_name'] ?? null;
        return is_string($path) && $path !== '' ? $path : null;
    }

}
