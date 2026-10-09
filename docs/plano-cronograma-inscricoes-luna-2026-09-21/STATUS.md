# Progresso — cronograma anterior às inscrições

## Referência e estado

- Plano criado em 21/09/2026.
- Branch de implementação: `codex/cronograma-inscricoes-luna-2026-09-21`.
- Checkout de referência: `c8e9c1be85a49bccfa0c6cca88db97d11f33ed2f`.
- Estado da funcionalidade: **implementação concluída e validada localmente**.
- Contrato adotado: fluxo planejado único para as novas edições; não existe modo legado, adoção ou conversão de competição neste pacote.
- Escopo confirmado: cabo de guerra fora do evento e nenhuma interação de chaveamento entre categorias diferentes; recursos físicos compartilhados continuam sujeitos a conflitos.

## Tarefas

| Tarefa | Estado | Entrega e decisões | Evidência | Próxima ação |
| --- | --- | --- | --- | --- |
| T00 | Validada | Baseline, mapa de rotas/locks, schema, filas offline e consumidores de equipes, agenda, inscrição e chaveamento conferidos. | Qualidade e baterias oficiais finais executadas nos containers descartáveis. | Nenhuma. |
| T01 | Validada | `001_cronograma_inscricoes.sql` define planejamento, quantidade finita de equipes por modalidade, limites de elenco e snapshot; `002_cronograma_nos.sql` define nós, BYEs e dependências. O schema não possui seletor de modo legado; toda edição criada inicia com inscrições fechadas. | Migration, instalação, repetição e recuperação passaram em MariaDB 10.11 e MySQL 8.4. | Nenhuma. |
| T02 | Validada | Preparação idempotente cria a quantidade configurada por turma, com ordinal estável e sem alunos fictícios; redução com vínculos, jogos ou histórico é recusada. | Integração oficial e `CronogramaPlanejadoTest` passaram; equipes vazias não criam partidas nem pontuação. | Nenhuma. |
| T03 | Validada | `CronogramaBracketPlanner` persiste árvore determinística por modalidade/turma, nós normais e BYEs, origens e equipes candidatas; compromissos condicionais são projetados sem elenco. | `CronogramaBracketPlannerTest` cobre 3, 4, 6 e 8 entradas; integração valida persistência, publicação e projeção. | Nenhuma. |
| T04 | Validada | Geração considera todas as modalidades ativas configuradas, turmas, janelas, locais, duração, descanso, reservas existentes e margem; publicação revalida a proposta e bloqueia pendências. | Integração MariaDB/MySQL e regressões de agenda passaram. | Nenhuma. |
| T05 | Validada | Serviço e API cobrem preparar, gerar, publicar, abrir, encerrar e revisar com revisão otimista; publicação ocorre antes da abertura das inscrições e revisão preserva a versão suspensa. | Integração e navegador (`cronograma-planejado.spec.cjs`) passaram. | Nenhuma. |
| T06 | Validada | Inscrição e inclusão administrativa usam equipe exata, capacidade própria, limite de três modalidades e conflito potencial/confirmado entre compromissos da mesma turma; lote inválido não grava parcialmente. | Integração valida conflito entre duas modalidades da mesma categoria/turma e rollback; MariaDB/MySQL passaram. | Nenhuma. |
| T07 | Validada | Cadastro e agenda exibem quantidade planejada, rascunho, publicação, revisão e abertura; controles removem ativação legada e preservam ciclo de vida/reentrada da página. | Build, checagem JS, navegador e visual passaram. | Nenhuma. |
| T08 | Validada | Revisão fecha inscrições, lista equipes incompletas, materialização de nó é idempotente e BYE não vira partida; operações de planejamento/publicação permanecem online e a fila de resultados offline existente não é alterada nem descartada. | Testes offline e integração passaram; não foi criada inscrição offline, conforme escopo. | Nenhuma. |
| T09 | Validada | Documentação do pacote, arquitetura e implantação atualizadas; branch pronta para revisão e sem push. | Bateria completa MariaDB com qualidade, integração, navegador e visual; integração adicional MySQL; `git diff --check` sem erros. | Aguardar revisão/integração; não fazer push automaticamente. |

## Execuções finais registradas

```text
Data: 21/09/2026 (America/Sao_Paulo)
Branch: codex/cronograma-inscricoes-luna-2026-09-21

powershell -ExecutionPolicy Bypass -File tools/test-local.ps1 -Suite quality
exit code 0; PHPUnit 384 testes/2.671 asserções; PHPStan 242/242; CS Fixer 0/322;
build 112 arquivos; npm check 44 arquivos; npm test 129/129.
O executor registrou uma falha isolada de cleanup, continuou as etapas e preservou o código original; a execução terminou com código 0.

powershell -ExecutionPolicy Bypass -File tools/test-docker.ps1 -Database mariadb -SkipQuality -SkipBrowser
exit code 0; integração 1.011/1.011 asserções.

powershell -ExecutionPolicy Bypass -File tools/test-docker.ps1 -Database mysql -SkipQuality -SkipBrowser
exit code 0; integração e migrations 1.011/1.011 asserções.

powershell -ExecutionPolicy Bypass -File tools/test-docker.ps1 -Database mariadb -IncludeVisual
exit code 0; qualidade PHP/JS aprovada; integração 1.011/1.011; navegador 168/168 testes aprovados; contrato visual 2/2.

Artefatos da bateria final:
test-results/docker-20260921_220156_7c022c
tests/browser/test-results/docker-20260921_220156_7c022c
tests/browser/playwright-report/docker-20260921_220156_7c022c

Os containers e bancos foram descartáveis e removidos pelo executor. Nenhuma migration foi aplicada à base de trabalho e não houve push.
```

## Limitações registradas

- A bateria local não comprova CI remoto.
- O evento real ainda precisa informar datas, durações, locais, turmas e mínimos de elenco; os testes usam fixtures sintéticas.
- Planejamento, publicação e inscrição são online. A operação offline existente continua restrita aos resultados do mesário preparados na mesma aba; inscrições offline não fazem parte deste pacote.
- Não houve falha funcional persistente na bateria final; os testes de navegador e o contrato visual terminaram aprovados.

## Retomada

Não há tarefa incompleta no roteiro. Em uma próxima alteração, reexecutar a regressão específica e a bateria completa antes de publicar qualquer mudança.
