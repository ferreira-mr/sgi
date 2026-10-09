# Progresso — fluxo único de competição

Atualizado em 23/09/2026, America/Sao_Paulo. **Estado: fluxo implementado; bateria MariaDB aprovada; validação ponta a ponta ainda parcial.** Referência inicial: `eaef642d37c4f0f182cc090793947a1aab986921`. O checkout contém alterações preexistentes de outras tarefas, mantidas fora dos commits deste trabalho.

## Etapas

| Etapa | Estado observado | Evidência / pendência |
| --- | --- | --- |
| U00 | Validada | Baseline focal PHP/JS e mapa inicial registrados abaixo. |
| U01 | Validada | Integração cobre calendário com equipes sem alunos, consulta da agenda antes da inscrição e conflito planejado. |
| U02 | Implementada; validação parcial | Migração e vínculo nó/jogo incluídos; repetição da migração exercitada no MariaDB. Falta cenário explícito de atualização com jogos legados ambíguos e colisões entre dados existentes. |
| U03 | Implementada; validação parcial | Liberação cria jogos em transação, testa mínimo, rollback tardio e repetição idempotente. Concorrência simultânea não foi exercitada. |
| U04 | Implementada; validação parcial | Integração cobre seis entradas, BYE intermediário, avanço até a final e correção do resultado antes/depois de iniciar descendentes; ranking/pontuação integral ainda precisa de verificação focada. |
| U05 | Implementada; validação parcial | E2E percorre uma final liberada offline até reconciliação; não cobre torneio de várias fases offline nem revisão concorrente com fila pendente. |
| U06 | Implementada; validação parcial | Novo E2E percorre pela interface a edição, preview sem equipes inscritas, inscrição do aluno, liberação e operação do mesário; faltam formato individual e matriz completa de papéis/escopo. |
| U07 | Validada nos caminhos cobertos | Geração antiga recusa com código estável; sincronização legada e escritores administrativos incompatíveis são bloqueados por regressões de integração. |
| U08 | Parcial | V01–V20 continua com lacunas explicitadas na matriz abaixo; os novos testes ampliam a cobertura de fluxo completo e migration MariaDB. |
| U09 | Validada para MariaDB | Bateria completa após as novas regressões aprovada em `20260923_222418_61cea1`; MySQL não foi executado conforme orientação do usuário. |

## Decisões implementadas

- Calendário é a fonte de confrontos; publicação acontece com equipes vazias.
- “Liberar competição” cria os jogos já resolvidos em lote atômico. Resultados disponibilizam fases seguintes na mesma árvore.
- Chaveamento é visualização e operação; geração inicial independente será retirada também do servidor.
- O vínculo persistente entre nó publicado e jogo físico usa uma migração nova; a liberação é idempotente e não troca a árvore após começar a operação.
- Resultados e BYEs avançam pela árvore `PL:` publicada. Filas existentes continuam compatíveis com identificadores `MM:` legados.
- Não há autorização de push, merge, deploy ou reset de base de trabalho.

## Baseline U00 — 23/09/2026, America/Sao_Paulo

HEAD conferido: `eaef642d37c4f0f182cc090793947a1aab986921`. `git status --short` mostrou alterações preexistentes em AGENTS, executores, Dockerfiles, README, testes de navegador e documentos, além de artefatos; foram preservadas. As suítes focais foram executadas antes de editar código:

| Comando | Resultado |
| --- | --- |
| `php vendor/bin/phpunit --configuration phpunit.xml --filter 'Cronograma|Chaveamento|Resultado|Inscricao'` | exit 0; 69 testes, 260 assertions, uma depreciação PHPUnit |
| `npm test` | exit 0; 130 testes JS aprovados |

Mapa observado: `/api/v1/cronograma` → `CronogramaController` → `CronogramaService` → `MysqliCronogramaRepository`; `releaseOperation` valida mínimos e só muda a flag; `materializeNode` cria um nó físico separadamente. `/api/v1/chaveamentos` → `ChaveamentoController` → `ChaveamentoService` → `MysqliChaveamentoManagement::createBracket` sorteia equipes com elenco e produz tags `MM:`; `MysqliPartidaGateway` chama avanço MM depois do resultado. O planner salva nós `PL:`; `plannedNodeParticipants` consulta origens/resultados, mas o avanço online e `chaveamento-engine.js` não estão ligados à identidade `PL:`. A tela chaveamento ainda chama o POST de geração; não foi localizado uso de UI para `materializar_no`. O portal do aluno consulta equipes planejadas antes da inscrição.

Arquivos da área de código não estavam modificados no início. `vendor/bin/phpunit` existe. Docker respondeu acesso negado ao pipe `npipe:////./pipe/docker_engine` durante a inspeção anterior. Não há baseline SQL/HTTP/browser. Os logs das duas suítes focais são a saída de terminal desta execução; elas não produziram artefatos dedicados.

## Evidências deste pacote

As aprovações históricas dos outros planos não aprovam U00–U09. Os estados acima se referem somente a esta implementação.

Validação documental em 23/09/2026 às 10:26 BRT: os links relativos e os caminhos completos citados nos sete arquivos foram conferidos por leitura e `Test-Path`; todos existem. Flags dos runners, caminho `vendor/bin/phpunit` e atalho `test:offline-queue` foram conferidos no projeto. `git diff --check` terminou com exit code 0, com avisos de conversão CRLF/LF em arquivos preexistentes. Como o pacote é novo e ainda não rastreado, seus sete arquivos também passaram pela checagem `git diff --no-index --check -- NUL <arquivo>` sem diagnóstico de whitespace; exit code 1 nesse modo indica diferença em relação ao arquivo vazio, não falha funcional. Nenhum arquivo preexistente foi editado para produzir o plano.

## Implementação e validação final

O fluxo principal foi implementado: o cronograma publicado é preparado com equipes vazias; estudantes consultam compromissos previstos; após encerrar inscrições, a ação **Liberar competição** valida os elencos e cria os jogos iniciais em transação; o chaveamento passa a exibir a mesma árvore e os resultados avançam os nós publicados. O endpoint de geração independente foi desativado com resposta estável. A implementação também associa jogos à identidade dos nós publicados e mantém os formatos legados necessários à sincronização já persistida.

Validação final em container descartável, somente MariaDB, conforme pedido:

| Campo | Resultado |
| --- | --- |
| Comando | `powershell -ExecutionPolicy Bypass -File tools/test-docker.ps1 -Database mariadb -IncludeVisual` |
| Execução aprovada | `20260923_165945_261e02` |
| Data/hora | 23/09/2026 16:59:45–17:10:34 UTC (13:59:45–14:10:34 America/Sao_Paulo) |
| Ambiente | Docker Compose descartável; PHP 8.4.25, MariaDB 10.11; URL interna da suíte `http://localhost/SGI/`; containers removidos ao final |
| Qualidade | Exit 0; PHPUnit 389 testes / 2.684 assertions (1 depreciação PHPUnit), lint PHP e JavaScript 132/132 |
| Integração HTTP/banco | Exit 0; 1.030/1.030 assertions |
| Navegador | Exit 0; 169/169 testes, sem retry na execução aprovada |
| Contrato visual | Exit 0; 2/2 snapshots aprovados |
| Resultado do executor | Exit 0, `status: passed` no manifesto |
| Manifesto e logs | `test-results/docker-20260923_165945_261e02/run-manifest.json`, `integration-timings.json`, `docker-compose.log`, `browser-playwright.json` e `visual-playwright.json` |
| Evidência de navegador | `tests/browser/test-results/docker-20260923_165945_261e02/browser/` e `tests/browser/test-results/docker-20260923_165945_261e02/visual/` |

A tentativa completa imediatamente anterior (`20260923_164812_067017`) teve um teste de modal de turma instável no primeiro intento e aprovado no retry; por isso o runner marcou aquela execução como falha. A execução aprovada acima repetiu a bateria completa e passou sem retries. Uma tentativa MySQL anterior à orientação atual identificou ordenação incompatível com `DISTINCT`; a consulta foi ajustada para ordenar pelos aliases selecionados e a bateria completa foi repetida no MariaDB. Nenhum teste MySQL foi executado após a orientação de testar apenas MariaDB. CI remoto, deploy, push e merge não foram executados.

## Rastreamento da matriz V01–V20

“Coberto” indica que a regressão descrita está exercitada de forma direta. “Parcial” indica que há cobertura relacionada, mas falta ao menos uma condição da matriz. A bateria verde não transforma cenários parciais em aprovados.

| ID | Estado | Evidência e limite conhecido |
| --- | --- | --- |
| V01 | Parcial | `CronogramaPlanejadoTest` cobre equipe vazia e preview de 3/4/6 entradas; novo E2E publica o calendário sem inscrições. Falta a jornada completa de quatro equipes pela interface. |
| V02 | Parcial | `CronogramaPlanejadoTest` e novo E2E consultam a agenda antes da inscrição e fazem inscrição no portal; isolamento por edição/escopo ainda não está integralmente coberto pela interface. |
| V03 | Parcial | Integração recusa conflito planejado entre modalidades; regras gerais de inscrição têm suíte própria, mas não toda a combinação capacidade/janela/final condicional desta matriz. |
| V04 | Parcial | Publicação incompleta e conflito tardio de liberação são recusados; corrida simultânea de reserva não foi testada. |
| V05 | Parcial | Elenco abaixo do mínimo e materialização antes da liberação são recusados; revisão antiga e concorrência não cobertas integralmente. |
| V06 | Parcial | Liberação cria jogos iniciais ligados aos nós e mantém fases futuras previstas; novo E2E percorre a liberação pela interface administrativa, mas não cobre quatro equipes nesse percurso. |
| V07 | Coberto | `CronogramaPlanejadoTest`: falha após criação anterior reverte jogos, vínculos e flag de liberação. |
| V08 | Parcial | Repetir liberação é idempotente; timeout e requisições concorrentes não foram exercitados neste caminho. |
| V09 | Parcial | Integração encerra torneio de seis entradas com três jogos iniciais, BYE intermediário, semifinal e final; valida vencedores/estado terminal, mas não toda pontuação do torneio. |
| V10 | Coberto para topologia planejada | Teste unitário valida seis entradas, três jogos iniciais, BYE intermediário e origens PL; integração também percorre o avanço até campeão. |
| V11 | Coberto nos limites testados | Integração confirma correção do resultado refletida na final ainda não iniciada e recusa correção depois de descendente iniciado, preservando o resultado publicado. |
| V12 | Parcial | Suítes existentes de modalidade individual/ranking continuam verdes; falta regressão direta de liberação e ranking individual criada pelo novo planejamento. |
| V13 | Coberto nos caminhos alterados | `MataMataEdgeCasesTest` verifica código estável da geração antiga; integração também verifica bloqueio da sincronização legada após publicação. |
| V14 | Parcial | Controller testa a recusa do endpoint antigo e as suítes RBAC/CSRF gerais passaram; matriz completa de papéis e liberação em outra edição não foi criada para o novo caso. |
| V15 | Parcial | Novo E2E conclui a final offline e reconcilia com estado do servidor; falta repetir o fluxo offline em torneio de várias fases/revisão. |
| V16 | Parcial | Suíte IndexedDB existente passou; a cobertura de confirmação inválida, ordem e isolamento não foi repetida com final `PL:` do novo fluxo. |
| V17 | Parcial | Revisão depois da liberação é bloqueada e preserva a árvore; filas pendentes ao mudar revisão não foram percorridas. |
| V18 | Parcial | MariaDB verifica migration 004 com vínculo único, duplicatas legadas sem vínculo e reaplicação após restauração; colisões entre edições/modalidades e MySQL não fazem parte do escopo solicitado. |
| V19 | Parcial | Bateria browser/visual aprovada e telas responsivas existentes cobertas; falta auditoria focada de foco/teclado/raiz/subdiretório para a nova jornada completa. |
| V20 | Coberto no cenário E2E | `cronograma-jornada-e2e.spec.cjs` percorre APIs reais e interfaces de administrador/aluno/mesário desde calendário sem elenco até final offline reconciliada; formatos individuais e variações de escopo seguem nas pendências U06/U08. |

## Continuação da implementação — 23/09/2026

Esta continuação preserva integralmente as alterações preexistentes e o container/dados/arquivos de homologação. Foram adicionadas regressões para torneio de seis participantes com BYE intermediário, correção segura de resultado antes e depois de iniciar descendentes, associação inequívoca de dados legados na migration 004 e uma jornada de navegador com calendário vazio, inscrição estudantil, liberação administrativa e final do mesário offline com reconciliação. Também foi estabilizado o ciclo de transição do modal de descarte da configuração.

Integração focada MariaDB aprovada em `20260923_221949_a8e9d5`, 23/09/2026 22:19:49–22:21:41 UTC (19:19:49–19:21:41 BRT): 1.038/1.038 assertions, incluindo `MigrationSupportTest` e `CronogramaPlanejadoTest`; container descartável removido. A bateria completa (qualidade, integração, navegador e visual) está pendente de reexecução após estas adições. A tentativa anterior da nova fixture de seis entradas falhou apenas por comparar o nome incorreto do campo de preview (`tipo_no` em vez de `eh_bye`); a fixture foi corrigida e o rerun focal passou. A primeira fixture da migration também duplicava o estado que a migration 003 já cria; passou a atualizar o estado existente, e a regressão foi aprovada no rerun acima.

Bateria final MariaDB aprovada em `20260923_222418_61cea1`, 23/09/2026 22:24:18–22:35:28 UTC (19:24:18–19:35:28 BRT). Comando: `powershell -ExecutionPolicy Bypass -File tools/test-docker.ps1 -Database mariadb -IncludeVisual`. Ambiente: Docker Compose descartável, PHP 8.4.25, MariaDB 10.11; `environment_kept: false`; limpeza de containers, volume e rede concluída. Qualidade: PHPUnit 390 testes / 2.694 assertions (1 depreciação), lint PHP e 132/132 testes JavaScript. Integração HTTP/banco: 1.038/1.038 assertions. Navegador: 170/170, zero falhas, retries ou skips. Visual: 2/2, zero falhas, retries ou skips. Manifesto `test-results/docker-20260923_222418_61cea1/run-manifest.json`; medições de integração em `integration-timings.json`, resultados Playwright em `browser-playwright.json` e `visual-playwright.json`. Nenhum teste MySQL foi executado. A tentativa sem permissão para ler a configuração Docker do usuário falhou antes de iniciar; a mesma bateria foi repetida com acesso ao Docker e aprovada. O container, base e arquivos de homologação não foram alterados.

Próxima ação recomendada: completar primeiro V18 (migração com dados legados), V09–V11 (avanço/correção e seis entradas), V15–V17 (reconciliação offline/revisão) e V20 (jornada real pela interface). A validação MariaDB acima é integral para a bateria automatizada existente, mas não substitui esses cenários de aceite ainda ausentes.

## Registro obrigatório por etapa

Copiar e preencher, sem apagar falhas anteriores:

```text
Etapa / estado:
Data/hora/fuso e responsável:
HEAD e alterações preexistentes preservadas:
Contratos / decisões / arquivos alterados:
Teste que reproduz a falha e resultado antes:
Comandos exatos e exit codes depois:
Ambiente / URL / run ID:
Esperado / observado:
Logs / manifest / trace / screenshots existentes:
IDs V01–V20 cobertos e nomes dos testes:
Limitações / falhas preexistentes / pendências:
Próxima ação e dependências:
```

Uma etapa só muda para validada com evidência do aceite. Se já estiver implementada no checkout encontrado, demonstrar o comportamento e registrar em vez de refazer. Resultado parcial fica parcial; suíte bloqueada fica bloqueada. Retomar a primeira etapa incompleta após reler este arquivo.
