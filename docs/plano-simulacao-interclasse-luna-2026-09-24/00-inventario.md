# 00 — Inventário e contratos de partida

## Fontes conferidas nesta elaboração

Inspeção estática; nenhuma aprovação de runtime foi inferida desta lista.

| Área | Fonte atual | Consequência para a simulação |
| --- | --- | --- |
| Criação da edição | `src/Modules/Eventos/Infrastructure/MysqliEdicaoRepository.php` | Cria 7 turmas, 2 categorias e 5 modalidades em cada categoria |
| Regras de inscrição | `src/Modules/Participantes/Domain/InscricaoRules.php`, `Application/InscricaoService.php`, `Infrastructure/MysqliInscricaoRepository.php` no mesmo módulo | Limite de 3 modalidades, compatibilidade de gênero/categoria, capacidade e agenda |
| Planejamento | `src/Modules/Competicoes/Presentation/Http/CronogramaController.php`, `Application/CronogramaService.php`, `Infrastructure/MysqliCronogramaRepository.php` | Preparar → gerar → publicar → abrir/encerrar → revisar ou liberar; `equipes_planejadas` é quantidade por turma |
| Resultado coletivo | `src/Modules/Competicoes/Application/ResultadoService.php`, `Presentation/Http/ResultadoController.php` | Pontos vinculados, autoria, resultado, avanço e pontuação precisam permanecer consistentes |
| Individual | `src/Modules/Competicoes/Application/IndividualRankingService.php`, `Presentation/Http/ChaveamentoController.php` | Ranking com primeiro, segundo e terceiro distintos; prova preparada previamente; mesário não cria prova |
| Terceiro lugar coletivo | `src/Modules/Competicoes/Domain/ChaveamentoRules.php`, `src/Modules/Resultados/Application/PontuacaoService.php` | Derivado do perdedor da semifinal vencida pelo campeão; bye nessa semifinal não gera terceiro automaticamente |
| Pontuação | `src/Modules/Resultados/Domain/PontuacaoRules.php`, `Infrastructure/MysqliRankingRepository.php` | Arrecadação com arredondamento, esportes, ajuste, bruto e desconto das penalidades uma vez |
| Superfície HTTP | `config/routes.php`, `config/routes/web.php` | Não inventar endpoints procedurais ou ações de payload |
| Offline | `resources/js/offline/`, `src/Modules/Sincronizacao/` | Fila de transporte, projeções, dependências, idempotência e isolamento de operador |
| Isolamento e descoberta | `tests/Support/TestDatabase.php`, `tests/run_all.php`, `tests/browser/playwright.config.cjs`, `tools/test-local.ps1`, `tools/test-docker.ps1`, `tools/test-docker.sh` | Banco descartável obrigatório; testes com SQL no projeto serial `database` |

Conferir também todas as migrações em `database/migrations/`, as guardas de acesso e os escritores laterais dos recursos antes de implementar. O checkout já contém mudanças de cronograma, portal, CI e runners feitas em outras tarefas; não as descartar nem incorporá-las indevidamente ao commit da simulação.

## Cobertura a aproveitar e ampliar

| Testes existentes | Aproveitamento e limite |
| --- | --- |
| `tests/Integration/InterclasseLifecycleTest.php` | Criação/configuração; não representa os 224 alunos |
| `tests/Integration/CronogramaPlanejadoTest.php`, `InscricaoModalidadesTest.php`, `ConcurrentScheduleTest.php` | Contratos e regressões de planejamento/inscrição; acrescentar continuidade em escala real |
| `tests/E2E/FullOfflineTournamentTest.php` | Envia resultados temporários por HTTP; isso sozinho não exercita a fila real do navegador |
| `tests/Integration/PodiumCreditTest.php`, `IndividualSyncCreditTest.php`, `PontuacaoReconciliationTest.php`, `HistoryRankingReconciliationTest.php` | Origens e reconciliação; integrar os efeitos ao livro completo |
| `tests/Integration/ArrecadacaoConsistencyTest.php`, `OcorrenciasAndRankingTest.php` | Histórico, estorno e disciplina; incluir todas as turmas |
| `tests/Integration/AtomicMutationTest.php`, `ConcurrentInvariantsTest.php`, `ConcurrentPontoFinalizationTest.php`, `TemporaryResolutionScopeTest.php` | Atomicidade, corridas e resolução temporária; reaproveitar barreiras determinísticas |
| `tests/browser/cronograma-jornada-e2e.spec.cjs` | Jornada existente reduz escopo de turmas/modalidades; o novo cenário deve mantê-las todas |
| `tests/browser/tournament-offline.spec.cjs`, `offline-tournament-bracket.spec.cjs`, `mesario-offline.spec.cjs`, `occurrence-offline-edit.spec.cjs` | Navegação/placar/fila reais; combinar com o ciclo completo |
| `tests/browser/offline-queue-regression.spec.cjs` | Falhas controladas de protocolo com IndexedDB; manter complementar ao backend real |
| `tests/browser/individual-ranking.spec.cjs` | Há respostas interceptadas; acrescentar as quatro provas com persistência real |
| `tests/Integration/RankingPublicationTest.php`, `AuthAndRbacTest.php`, `FirstLoginPasswordChangeTest.php` | Publicação, perfis e autenticação; exercitar no antes/durante/depois |

`tests/seed_interclasse_demo.php` não deve ser a base da simulação: usa uma importação pontual e não estabelece participação sintética completa nem o livro esperado. Não reutilizar PDF com possíveis dados pessoais. Criar fixture sintética reproduzível para importação.

## Contratos que exigem cuidado

1. Publicar cronograma, abrir inscrições, liberar operação, encerrar edição e publicar ranking são marcos diferentes. Não substituir um pelo outro.
2. Antes de liberar, repetir revisão/publicação com alunos já inscritos em duas modalidades de horários distintos. Depois da liberação, não substituir a árvore para contornar um erro.
3. Um placar novo precisa dos pontos vinculados. Não escrever placar final por SQL nem desativar `exige_vinculo_ponto`.
4. Mata-mata com 3 turmas tem bye. Não fabricar jogo disputado para esse nó, partida de terceiro lugar ou jogo solo de campeão.
5. O domínio possui desempate técnico por ID em certas derivações. Não apresentá-lo como regra esportiva oficial: examinar também a validação HTTP de empates, registrar a divergência se existir e usar resultados sem empate no caminho principal.
6. A corrida registra pódio no contrato atual. Tempos, baterias, desclassificação e classificação de todos os colocados podem existir apenas no roteiro externo; confirmar antes de exigir campos na API.
7. Cartão, suspensão ou ausência no roteiro não comprovam bloqueio automático de atleta, W.O. ou mudança de placar. Testar comportamento existente e identificar o que falta.
8. Conferir leitura permitida por rota: `ChaveamentoController` hoje recusa GET do aluno. A consulta estudantil após premiação deve usar os caminhos de classificação/ranking autorizados, sem alargar permissões para satisfazer o cenário.
9. Não importar proibições ou aprovações históricas de outros planos como instruções desta tarefa. Na implementação futura, registrar as restrições vigentes da sessão.
