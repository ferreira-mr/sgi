# Inventário e diagnóstico de partida

## Achados por inspeção

1. `MysqliCronogramaRepository::generateDraft` usa equipes preparadas, sem exigir vínculos com alunos; a publicação persiste nós e compromissos.
2. `releaseOperation` confere estado e mínimos de elenco, mas apenas altera `operacao_liberada`.
3. `materializeNode` cria jogo/partidas de um nó com participantes resolvidos e agenda publicada. É exposto por `materializar_no`; não foi encontrado chamador dessa ação nos scripts de interface pesquisados.
4. `MysqliChaveamentoManagement::createBracket` seleciona equipes com competidores e chama `criarChaveamentoInicial`. O botão em `chaveamento.js` chama essa geração separada.
5. `chaveamentoProcessarAvanco` e o motor offline trabalham com metadados de fases; o parser atual de `ChaveamentoRules` reconhece `MM:`/`POS:`, enquanto o planejamento produz tags `PL:`. Apenas chamar o motor existente não demonstra avanço de jogos planejados.
6. A consulta `studentAgenda` considera equipes elegíveis por turma/categoria/gênero sem exigir matrícula na equipe. Preservar as alterações recentes desse portal.
7. `CronogramaPlanejadoTest` parte de fixtures existentes. Não demonstra explicitamente uma competição inteira com zero vínculos antes da publicação. O spec `cronograma-planejado.spec.cjs` inspecionado usa respostas simuladas para revisão.

São achados de código, não uma homologação. Não transportar contagens de testes de outros planos para o STATUS deste pacote.

## Arquivos existentes a abrir

Todos os caminhos abaixo são relativos à raiz. Localizar métodos pelo nome, pois linhas mudam. Novos arquivos ou classes decididos durante a implementação devem ser identificados como novos no STATUS.

| Área | Arquivos e responsabilidade |
| --- | --- |
| Planejamento | `src/Modules/Competicoes/Domain/CronogramaBracketPlanner.php`, `CronogramaRules.php`, `CronogramaRepository.php`; árvore, regras e contrato |
| Caso de uso | `src/Modules/Competicoes/Application/CronogramaService.php`; coordenação atual e futura liberação |
| Persistência | `src/Modules/Competicoes/Infrastructure/MysqliCronogramaRepository.php`; preparação, publicação, liberação, materialização, revisão e consulta do aluno |
| HTTP | `src/Modules/Competicoes/Presentation/Http/CronogramaController.php`, `ChaveamentoController.php`; ações, escopo e respostas |
| Geração e leitura | `src/Modules/Competicoes/Application/ChaveamentoService.php`, `Domain/ChaveamentoManagement.php`, `Infrastructure/MysqliChaveamentoManagement.php`, `MysqliChaveamentoRepository.php`, `Domain/ChaveamentoRules.php` |
| Resultado e individual | `src/Modules/Competicoes/Application/ResultadoService.php`, `Infrastructure/MysqliPartidaGateway.php`, `MysqliIndividualRepository.php`; pontos, avanço e ranking |
| Outros escritores | `src/Modules/Competicoes/Infrastructure/MysqliJogoRepository.php`, `MysqliJogoGateway.php`, `MysqliAgendamentoBlocoRepository.php`, `MysqliLocalScheduleGuard.php`; criação, edição e disponibilidade |
| Inscrição | `src/Modules/Participantes/Application/InscricaoService.php`, `Infrastructure/MysqliInscricaoRepository.php`, `MysqliPortalAlunoRepository.php`; seleção, revisão e opções |
| Sincronização | `src/Modules/Sincronizacao/Infrastructure/MysqliChaveamentoSyncGateway.php`, `MysqliMutationStore.php`; identidade temporária e confirmação atômica |
| Offline | `resources/js/offline/chaveamento-engine.js`, `mesario-data.js`, `mesario-offline.js`, `offline-core.js`; projeção, árvore, cache e fila |
| Agenda administrativa | `resources/js/pages/eventos/configurar-agenda.js`, `resources/views/pages/eventos/configurar-agenda.php` |
| Chaveamento e placar | `resources/js/pages/competicoes/chaveamento.js`, `placar.js`, `resources/views/pages/competicoes/chaveamento.php` |
| Portal | `resources/js/pages/aluno/modalidade.js`, `resources/views/pages/aluno/modalidade.php` |
| Composição e schema | `config/routes.php`, `config/routes/web.php`, `database/migrations/`; ler todas as migrações e restrições reais |

## Inventário obrigatório em U00

Produzir no STATUS uma tabela `operação → rota → caso de uso → escritor → lock → identidade → leitores online/offline`. Buscar além de “cronograma”: `INSERT INTO jogos`, `criarChaveamentoInicial`, `chaveamentoProcessarAvanco`, `saveIndividual`, `materializar_no`, nomes de tags, criação manual e sincronização.

Separar geração inicial de registro de resultado individual: ambos passam hoje pelo serviço de chaveamento. Remover uma ação não pode remover a outra. Identificar leitores de classificação/pontuação que inferem fases por nome do jogo.

Mapear também os implementadores/dublês dos contratos, preparação offline, exportação/importação da fila, testes e fixtures que geram jogos diretamente. Inventariar índices de unicidade existentes antes de propor DDL. Registrar como um jogo já existente será reconhecido após uma revisão do mesmo evento.

Preservar os arquivos sujos encontrados no início. Não restaurar arquivos para reproduzir defeito, não incluir trabalho alheio em commits e revalidar o baseline se outra tarefa modificar a área durante a execução.
