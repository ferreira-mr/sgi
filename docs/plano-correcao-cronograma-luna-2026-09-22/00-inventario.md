# Inventário e lacunas de partida

## Código a conferir

Todos os caminhos da tabela são relativos à raiz. Abrir os arquivos da etapa e seus chamadores; não usar a tabela como substituto da leitura.

| Arquivo existente | Responsabilidade e ponto da auditoria |
| --- | --- |
| `src/Modules/Competicoes/Domain/CronogramaBracketPlanner.php` | `plan` cria árvore por turma; tags omitem modalidade; BYE intermediário pode ter mais de um candidato |
| `src/Modules/Competicoes/Domain/CronogramaRules.php` | Intervalos e janela; validar datas estritamente e testar limites |
| `src/Modules/Competicoes/Domain/CronogramaRepository.php` | Contrato de planejamento atualmente orientado a operações completas de repositório |
| `src/Modules/Competicoes/Application/CronogramaService.php` | Principalmente repasse; precisa coordenar políticas e transações por contratos |
| `src/Modules/Competicoes/Infrastructure/MysqliCronogramaRepository.php` | Preparação, geração, publicação, estados, materialização e projeção; concentra A01–A03 e A06–A08 |
| `src/Modules/Competicoes/Presentation/Http/CronogramaController.php` | GET e ações POST/PUT; autorização atual de escrita para níveis 0/1, leitura 0/1/2/3 com restrições de edição |
| `src/Modules/Participantes/Application/InscricaoService.php` e `Domain/InscricaoRepository.php` | Encaminhar revisão obrigatória; contrato de inscrição exata |
| `src/Modules/Participantes/Infrastructure/MysqliInscricaoRepository.php` | Datas omitidas na regra, lote com commit parcial, revisão não recebida |
| `src/Modules/Competicoes/Infrastructure/MysqliEquipeRepository.php` e `MysqliEquipePadraoRepository.php` | Inclusão, capacidade e redistribuição; compartilhar política de disponibilidade |
| `src/Modules/Competicoes/Infrastructure/MysqliModalidadeRepository.php` | `savePlanning` invalida apenas publicação; revisar atualização de limites das equipes |
| `src/Modules/Participantes/Infrastructure/MysqliTurmaRepository.php` | Mudanças de turma/categoria que podem invalidar participantes |
| `src/Modules/Eventos/Infrastructure/MysqliLocalRepository.php` | Alterações de disponibilidade/escopo do recurso |
| `src/Modules/Competicoes/Infrastructure/MysqliLocalScheduleGuard.php` | Jogos e reservas existentes; integrar compromissos publicados e exclusão da própria reserva |
| `src/Modules/Competicoes/Infrastructure/MysqliJogoRepository.php`, `MysqliJogoGateway.php` e `MysqliAgendamentoBlocoRepository.php` | Escritores de jogos/horários e reservas; não podem ignorar cronograma publicado |
| `src/Modules/Competicoes/Infrastructure/MysqliChaveamentoRepository.php` e `MysqliChaveamentoManagement.php` | Resultado, avanço, identidades e topologia atuais |
| `src/Modules/Competicoes/Application/ResultadoService.php` | Transação de resultado, pontos e avanço; manter operação canônica |
| `src/Modules/Sincronizacao/Infrastructure/MysqliChaveamentoSyncGateway.php` | Avanço recebido da operação offline |
| `src/Modules/Participantes/Infrastructure/MysqliPortalAlunoRepository.php` | Consulta autorizada de opções do aluno |
| `resources/js/pages/eventos/configurar-agenda.js` | Prévia não invalidada; publicar/abrir acoplados; recuperação e ciclo de botões |
| `resources/views/pages/eventos/configurar-agenda.php` | Controles de período, publicação, encerramento e operação |
| `resources/js/pages/aluno/modalidade.js` | Enviar revisão consultada e manter seleção em erro |
| `resources/js/offline/offline-core.js`, `mesario-data.js`, `mesario-offline.js`, `chaveamento-engine.js` | Interceptação, projeções, preparo, reentrada e avanço offline |
| `config/routes.php` e `config/routes/web.php` | Composição, contratos públicos e páginas |
| `database/schema-inicial.sql` e `database/migrations/` | Fonte real do schema; consultar todas as migrações, inclusive as duas do cronograma |

## Testes existentes e o que falta provar

| Arquivo | Limitação a superar |
| --- | --- |
| `tests/Unit/Modules/Competicoes/CronogramaBracketPlannerTest.php` | Contagens de nós não provam confronto entre turmas, identidade entre modalidades nem vencedor após BYE |
| `tests/Unit/Modules/Competicoes/CronogramaRulesTest.php` | Caso dentro da janela não cobre limites nem projeção correta das datas no SQL |
| `tests/Unit/Modules/Participantes/InscricaoServiceTest.php` | Atualizar contrato e verificar revisão, sem tornar campos obrigatórios opcionais para manter testes antigos |
| `tests/Integration/CronogramaPlanejadoTest.php` | Serviços diretos, uma turma e recusa de equipe vazia; falta HTTP do aluno, publicação adversarial e jogo válido |
| `tests/Integration/InscricaoModalidadesTest.php` | Confirmar equipe exata, rollback do lote, janela e revisão no novo fluxo |
| `tests/Integration/ConcurrentInvariantsTest.php` e `ConcurrentScheduleTest.php` | Estender harness de concorrência com barreiras determinísticas para cronograma |
| `tests/Integration/MigrationSupportTest.php` | Ajustar preparo/cleanup de novas estruturas sem remover evidência de checksum ou falha de migração |
| `tests/browser/cronograma-planejado.spec.cjs` | API simulada; acrescentar jornada real e manter mocks somente para falhas controladas |
| `tests/browser/offline-queue-regression.spec.cjs` | Acrescentar revisão de cronograma com mutações pendentes e dados preparados |
| `tests/browser/visual-contract.spec.cjs` | Contrato atual cobre login; incluir estados relevantes da agenda após inspeção visual |

## Evidência histórica, não aprovação da implementação futura

A auditoria em `c88a5b0d` registrou 384 testes PHP, 129 JS, 1.011 asserções de integração, navegador com 166 aprovados e dois intermitentes, visual 2/2. Tudo isso foi executado antes das correções. Os dois intermitentes foram importação PDF e campo de senha do colaborador; causa não determinada. Seus erros textuais estão no log citado na auditoria.

O perfil visual substituiu a saída do navegador: C01 deve corrigir essa perda de evidências antes das novas homologações. Não declarar que trace antigo está disponível sem verificar o arquivo.

## Inventário obrigatório a produzir em C00

Registrar em STATUS uma tabela por operação: rota → controlador → caso de uso → escritor SQL → lock → revisão invalidada → consumidores online/offline. Incluir preparação, inscrição, inclusão/transferência/remoção de aluno, redistribuição, ativação/inativação, mudança de categoria, alteração de local, edição manual de jogo, agenda em blocos e sincronização. A busca por `cronograma` sozinha não encontra os caminhos que atualmente ignoram essa política.

Anotar também todos os implementadores e dublês de contratos que mudarão. Testes e fixtures devem acompanhar a nova API; não manter fallback de produto para acomodar uma fixture antiga.
