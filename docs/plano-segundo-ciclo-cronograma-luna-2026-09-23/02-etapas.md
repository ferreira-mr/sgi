# Etapas para Luna

## S00 — baseline e inventário (antes de editar)

Ler os contratos e `git status --short`; preservar mudanças preexistentes. Conferir rotas, template, JS, `CronogramaController`, `CronogramaService`, `CronogramaRepository`, `MysqliCronogramaRepository`, `MysqliAgendamentoBlocoRepository` e testes citados no diagnóstico. Buscar todos os consumidores de `agenda-blocos`, `gerar_rascunho`, `publicar` e escritores de reservas.

Executar testes existentes relevantes; registrar comandos, commit, checkout sujo, horário, run ID e resultados. Se houver refatoração, executar bateria completa antes e depois. Identificar quais regras já estão resolvidas e não refazê-las. Entrega: inventário atualizado e baseline no STATUS.

## S01 — regressões que expõem os defeitos

Primeiro corrigir D06: substituir a interpretação fixa de `PL:4:` no E2E pela identidade dos nós publicados e da fixture, mantendo as verificações de cardinalidade, fase, participantes e horários. Registrar a falha baseline; não classificá-la como ausência de jogos, pois o trace confirma os dois. Não enfraquecer a asserção para obter verde.

Adicionar testes em arquivos descobertos pelos executores: JS para ciclo de estado, Playwright para jornada na mesma página e integração para janela justa. Não deixar a cobertura apenas na sonda local da auditoria.

Casos mínimos: D01 repetir abrir/revisar após republicação; D02 um confronto de 20 min numa janela de 20 min reutilizável; D03 mensagem detalhada com `success:false`; D04 invalidar proposta ao alterar campos. Acrescentar falha do GET após POST confirmado e resposta de geração fora de ordem. Demonstrar falha antes da correção sem desfazer o trabalho do usuário.

## S02 — corrigir ocupação da revisão

Nos métodos `generateDraft`/`occupiedSlots`, separar compromissos substituídos de restrições externas. Ajustar assinatura/contrato se necessário, mantendo SQL na infraestrutura. Conferir publicação e reservas para aplicar a mesma semântica. Testes: primeiro e segundo rascunho usam a mesma vaga, terceira revisão também; uma reserva independente bloqueia de verdade; snapshot anterior continua íntegro; operação liberada continua impedindo revisão.

Aceite: V02–V04 verdes, sem reset/remoção de dados como correção. Não há alteração SQL estrutural obrigatória; se surgir necessidade, validar MariaDB e MySQL e explicar no STATUS.

## S03 — estado, proposta e erro na interface

Em `configurar-agenda.js`, centralizar atualização das ações do painel; separar indisponibilidade de regra e operação em andamento. Invalidar proposta por edição/revisão/parâmetros, usar a revisão do rascunho e bloquear ações concorrentes. Exibir pendências da geração de forma segura e compreensível. Recuperar estado após falha parcial sem botão inerte. Respeitar desativação/reativação da página.

Aceite: V01, V05–V10 e V13; repetir fluxo sem reload e com retorno à página. Não adotar `finally { todos.disabled = false }`, pois isso habilitaria ações proibidas. Não contornar erros atualizando silenciosamente apenas o número da revisão de uma proposta antiga.

## S04 — unificar programação e transições do servidor

Remover o controle sequencial concorrente da jornada de planejamento no template/JS. Revisar dependências do endpoint e retirar código obsoleto quando não houver consumidores atuais; não criar ponte de compatibilidade. Atualizar fixtures/testes que só existiam para o fluxo removido, substituindo-os por cobertura do contrato final. Preservar testes de regras que ainda se aplicam.

Conferir `openRegistrations`/`closeRegistrations`: transições válidas, operação liberada e repetição da mesma intenção não podem depender acidentalmente de `affected_rows`. Acrescentar regressão HTTP para comportamento decidido no contrato. Não ampliar permissões nem enfraquecer CSRF. Manter o bloqueio de revisão após liberar.

Aceite: V11–V14; painel não oferece geração/programação concorrente e todas as ações restantes têm resposta coerente. Alterações de visual exigem contrato visual; estilos apenas nos arquivos compartilhados existentes.

## S05 — jornada completa com APIs reais

Ampliar `cronograma-jornada-e2e.spec.cjs` ou criar spec sob o projeto `database` serial. Usar fixture própria pelo runner, sem depender de IDs ou dados locais. Na mesma página: preparar → gerar → publicar → abrir → encerrar → revisar → gerar nos mesmos horários → republicar → abrir → encerrar → revisar novamente → republicar → abrir/inscrever/encerrar → liberar. Assegurar que inscrições existentes sejam preservadas e continuem válidas; incluir consulta do aluno.

Depois da liberação, conferir árvore/horários, realizar partidas e reconciliar resultado offline seguindo a jornada existente. Revisar então deve ser explicitamente indisponível/recusado, preservando jogos e resultados. Separar erro de negócio esperado de erro de rede/servidor. Capturar requests, console e trace com dados sintéticos; não incluir tokens nos documentos.

## S06 — validação e entrega

Executar regressões focais, depois bateria completa do projeto com visual. Inspecionar falhas e evidências; snapshots só após inspeção da alteração intencional. Conferir instalação vazia, build, raiz/subdiretório e `git diff --check`. Atualizar documentação de operação para um único caminho; preencher todos os V01–V16.

Entregar arquivos alterados, resultados/comandos, run ID, logs, limitações e pendências. Commits apenas do escopo pronto e validado, conforme AGENTS; não incorporar alterações de outras tarefas. Não fazer push/deploy. Uma etapa com teste não executado ou falhando permanece parcial/bloqueada, nunca validada.
