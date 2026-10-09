# Progresso das correções — Luna

Atualizado em 22/09/2026 17:46 BRT. Referência auditada: `c88a5b0d3db995563ca996c46d7c0298248de057`.

**Estado:** implementação concluída no checkout de referência, com a bateria final local aprovada em MariaDB 10.11. Não houve push, merge, deploy, reset da base de trabalho ou limpeza do navegador. A partir da decisão registrada durante a execução, nenhuma nova validação foi feita em MySQL; a única execução histórica desse motor ocorreu antes dessa decisão e não é usada como aceite atual.

## Registro C00–C12

| Etapa | Estado | Resultado observável e próxima ação |
| --- | --- | --- |
| C00 | Validada | Checkout conferido em `c88a5b0d`; baseline dirigido de cronograma/inscrição passou com 14 testes e 81 asserções. Foram preservadas alterações posteriores/preexistentes. Próxima ação: separar artefatos por perfil. |
| C01 | Validada | `tools/test-docker.ps1` passou a separar `browser` e `visual` por execução. A falha inicial deixou artefatos distintos em `tests/browser/test-results/docker-20260922_173743_a58fbb` e foi corrigida. Próxima ação: fechar DDL e identidade. |
| C02 | Validada | Adicionada `003_cronograma_final_contract.sql`, com `id_turma` anulável, `versao_publicada`, `operacao_liberada` e backfill de planejamento. Instalação/repetição/recuperação passaram na suíte MariaDB; o teste de migrations restaura o schema antes do navegador. Próxima ação: validar árvore por turma. |
| C03 | Validada | Planner usa tags canônicas por modalidade/turma/fase/slot, BYE e identidade de nó; preparação incorpora equipes padrão sem metadados e reativa equipes existentes. Regressões unitária e `CronogramaPlanejadoTest` passaram. Próxima ação: unificar conflitos e disponibilidade. |
| C04 | Validada | Regras compartilhadas de janela `[abertura, fechamento)`, descanso, reservas e compromissos foram centralizadas; locks e revalidação ocorrem na infraestrutura. Concorrência e agendamento da suíte MariaDB passaram. Próxima ação: publicar/revisar atomicamente. |
| C05 | Validada | Publicação exige snapshot completo, revalida nós/compromissos, rejeita proposta parcial sem escrita e preserva publicação suspensa durante revisão. Regressão de rollback e conflitos foi aprovada. Próxima ação: fechar inscrição e tokens. |
| C06 | Validada | Inscrição valida versão em edição/publicada, janela no servidor, CSRF, autorização, gênero/categoria/turma, lote inteiro antes de gravar e idempotência. Cenários inválidos, rollback, capacidade e conflito entre modalidades passaram. Próxima ação: integrar escritores administrativos. |
| C07 | Validada | Alterações de modalidade invalidam publicação/liberação; equipes administrativas são compatíveis com rascunho e exigem planejamento publicado para inscrição. O defeito de equipe padrão não preparada foi reproduzido no navegador e corrigido no repositório, com regressão de integração. Próxima ação: mínimos e materialização. |
| C08 | Validada | Liberação exige mínimos de elenco; materialização respeita reserva, versão e identidade do nó e usa o motor atual de resultado/avanço/pontuação. Falhas deixam estado atômico e reenvios idempotentes. Próxima ação: validar portal e interface. |
| C09 | Validada | Portal envia `cronograma_versao`/`versao_publicada`; agenda administrativa usa ações canônicas e exibe revisão/liberação. O fluxo HTTP real de inscrição passou em desktop e mobile. Próxima ação: offline e reconexão. |
| C10 | Validada | IndexedDB mantém projeção de cronograma na revisão 3, marca obsolescência sem remover resultados/fila pendente e emite evento de revalidação. Testes JavaScript (130/130) e Playwright de fila, duas abas, reenvio e offline passaram. Próxima ação: matriz visual/jornada. |
| C11 | Validada com limite documentado | Navegador real aprovou 168/168 e visual 2/2 em MariaDB, incluindo quatro perfis, raiz/subdiretório, mobile/desktop, offline na mesma aba e reentrada. A matriz V01–V26 foi coberta pelos testes existentes e regressões adicionadas, mas não há um relatório independente para cada célula; isso permanece uma limitação de rastreabilidade, não uma aprovação de CI remoto. Próxima ação: revisão final do diff e commits. |
| C12 | Validada | Bateria final completa passou, `git diff --check` não encontrou erro e o stage foi separado em commits coerentes. Commits: `59ad95fc` (produção/migração), `1e2a15f8` (testes/fixtures/executor) e o commit documental atual. O registro fecha o roteiro. |

### Registro operacional por etapa

Todos os horários abaixo são BRT (America/Sao_Paulo), no ambiente Windows com Docker Compose descartável e MariaDB 10.11. Quando a etapa compartilha a bateria, o log indicado é o mesmo run; não houve skip ou retry usado para declarar aprovação.

| Etapa | Arquivos/decisão registrada | Comando, horário e exit code | Falha antes / aprovação depois / log / próxima ação |
| --- | --- | --- | --- |
| C00 | `AGENTS.md`, `README.md`, inventário e contratos; checkout preservado em `c88a5b0d` | `php vendor/bin/phpunit --configuration phpunit.xml --filter 'Cronograma|Inscricao'`, horário não capturado no resumo do terminal, `0` | 14/81 verde; baseline dirigido registrado antes das edições. Log do terminal da execução; iniciar C01. |
| C01 | `tools/test-docker.ps1`; diretórios de resultado browser/visual separados | `... -Database mariadb -SkipQuality -IncludeVisual`, 22/09 14:37:43 BRT, `1` antes; execução corrigida 22/09 17:23:45 BRT, `0` | Artefatos visuais colidiam na execução inicial; `docker-20260922_173743_a58fbb` preservou a falha e o run `docker-20260922_202345_8e82a4` aprovou. Seguir para DDL. |
| C02 | `003_cronograma_final_contract.sql`, repositórios de migração e `MigrationSupportTest` | `... -Database mariadb -SkipQuality -SkipBrowser`, 22/09 17:11:01 BRT, run `docker-20260922_201101_6c9d37`, `0` | Reexecução/backfill e restauração do schema passaram 1.016/1.016; log em `test-results/docker-20260922_201101_6c9d37/`. Validar topologia. |
| C03 | `CronogramaBracketPlanner`, `MysqliCronogramaRepository`, `CronogramaPlanejadoTest` | Mesmo run MariaDB de C02, `0` | Regressões de turmas, BYE, identidade e equipe sem metadado passaram; seguir para disponibilidade. |
| C04 | `CronogramaRules`, `MysqliLocalScheduleGuard` e locks de infraestrutura | Mesmo run MariaDB de C02, `0` | Reservas, descanso, janela e corridas de agenda passaram; seguir para publicação. |
| C05 | publicação/revisão em `CronogramaService`/repository e regressão de lote incompleto | Mesmo run MariaDB de C02, `0` | Proposta parcial falhou sem escrita antes da aprovação; snapshot/revisão passaram; seguir para inscrição. |
| C06 | `InscricaoService`, `MysqliInscricaoRepository` e contratos HTTP | Mesmo run MariaDB de C02, `0` | Lote inválido, janela, revisão, autorização, rollback e idempotência passaram; seguir para escritores. |
| C07 | `MysqliModalidadeRepository`, `MysqliEquipeRepository` e fixture de preparação | Bateria browser/visual `docker-20260922_195759_060414` (22/09 16:57:59 BRT) falhou antes; correção integrou no run `docker-20260922_202345_8e82a4` (22/09 17:23:45 BRT), `0` | Portal selecionava `6EF Futsal - 1` sem planejamento; regressão adicionada e 168/168 passaram depois. Seguir para operação. |
| C08 | mínimos/liberação/materialização e integração com resultado atual | `... -Database mariadb -SkipQuality -SkipBrowser`, run `docker-20260922_201101_6c9d37`, `0` | Mínimo−1 bloqueou liberação; materialização aguardou operação e preservou reservas; seguir para interface. |
| C09 | portal, agenda e `MysqliPortalAlunoRepository`; versões explícitas no frontend | Bateria final `... -Database mariadb -IncludeVisual`, run `docker-20260922_203437_be1b42`, `0` | A versão publicada ausente foi corrigida; portal real, raiz/subdiretório e visual passaram; seguir para offline. |
| C10 | `mesario-data.js`, `mesario-offline.js`, fila e helper de fixture | Bateria MariaDB com o conflito `docker-20260922_201253_560fe9` (22/09 17:12:53 BRT), seguida da corrigida `docker-20260922_202345_8e82a4` e da final `docker-20260922_203437_be1b42`, `0` nas duas últimas | Fixture inicialmente tentava republicar edição com inscrições e recebeu `CRONOGRAMA_INVALIDO`; isolamento por nova edição preservou dados e 168/168 passaram. Seguir para matriz. |
| C11 | suítes browser/visual, quatro perfis e regressões adicionadas | Bateria final MariaDB, 22/09 17:34:37 BRT, `0` | 168/168 browser e 2/2 visual; matriz V01–V26 coberta pelos executores existentes, sem relatório célula a célula. Revisar stage. |
| C12 | commits `59ad95fc`, `1e2a15f8` e documentação/evidências no commit atual; docs de validação MariaDB-only | `git diff --check`, revisão de stage e `git status`, 22/09 17:46 BRT, `0` | Nenhum erro de whitespace; arquivos da implementação separados dos quatro documentos preexistentes não staged. Não publicar automaticamente. |

## Evidências de execução

### Baseline e falhas descobertas

Antes das correções funcionais, a regressão dirigida passou com 14 testes/81 asserções. Durante a implementação, a primeira bateria de navegador revelou a equipe padrão não preparada no portal; o artefato visual está em `tests/browser/test-results/docker-20260922_195759_060414/browser/aluno-portal-Portal-do-Alu-0a640-quipe-e-validação-de-regras`. A execução seguinte revelou o conflito correto ao tentar republicar uma edição que já tinha inscrições (`CRONOGRAMA_INVALIDO`); os fixtures passaram a criar uma edição descartável somente nesse caso, sem apagar vínculos existentes.

### Execução final aprovada

Comando exato, executado em 22/09/2026, ambiente Windows + Docker Compose descartável, PHP 8.4, MariaDB 10.11:

```powershell
powershell -ExecutionPolicy Bypass -File tools/test-docker.ps1 -Database mariadb -IncludeVisual
```

Exit code: `0`. Run ID: `docker-20260922_203437_be1b42`.

- qualidade: PHPUnit 386 testes/2.675 asserções, 1 depreciação já reportada; lint PHP, PHPStan, estilo, build e `npm test` 130/130 aprovados;
- integração HTTP/banco/recuperação: 1.016/1.016 asserções aprovadas;
- navegador online/offline com API real: 168/168 aprovados;
- contrato visual desktop/mobile: 2/2 aprovados.

Logs do runner e Compose: `test-results/docker-20260922_203437_be1b42/`. Artefatos Playwright: `tests/browser/test-results/docker-20260922_203437_be1b42/browser/` e `tests/browser/test-results/docker-20260922_203437_be1b42/visual/`; relatórios HTML correspondentes ficam em `tests/browser/playwright-report/docker-20260922_203437_be1b42/`.

Antes da bateria final, a integração MariaDB isolada também passou 1.016/1.016 no run `docker-20260922_201101_6c9d37`; a bateria navegador/visual corrigida passou 168/168 e 2/2 no run `docker-20260922_202345_8e82a4`.

## Limitações e rastreabilidade

- O CI remoto não foi executado; os resultados acima são locais e descartáveis.
- A matriz V01–V26 não recebeu um relatório separado por célula; os testes aprovados reduzem os riscos conhecidos, mas não garantem ausência absoluta de regressões.
- Não foi feita nova execução em MySQL após a decisão de usar exclusivamente MariaDB.
- O pacote mantém o contrato final único; não foram adicionados aliases, conversores, fallbacks ou migradores de filas/publicações anteriores.

## Próxima ação

Revisão final concluída com `git status`, `git diff`, `git diff --cached` e `git diff --check`; somente os arquivos desta implementação foram commitados. Não fazer push, merge ou deploy.
