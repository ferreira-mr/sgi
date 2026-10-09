# Status de execução

**Estado em 24/09/2026:** implementação registrada no commit `55e3c11`; revalidação completa aprovada no `HEAD` `b31afce8d02b8042cee0f5b578b78f29ea8cf5d7`, run `20260924_161932_295cf6`. O checkout segue dirty com alterações locais preservadas (`working_tree_dirty=true`). A execução original ocorreu em `1ac473ce` com a implementação ainda no working tree; os detalhes daquela execução permanecem abaixo. Este trabalho seguiu a decisão do usuário de implantação nova sem dados e sem compatibilidade com formatos/versões antigas.

## Decisões e diagnóstico (S00)

| ID | Resultado | Decisão/evidência |
| --- | --- | --- |
| D01 | Causa confirmada e corrigida | Indicadores misturavam reconhecimento da final por prefixo de nome com vencedor calculado pela árvore. Agora a contagem usa resultado/fase estruturados, inclui chaveamento `PL:` e ranking individual, e conta modalidade uma vez. |
| D02 | Causa confirmada e corrigida | A formatação combinava `data_inicio_real` com `termino_jogo` agendado e permitia `NaN`. A coluna agora se chama **Duração do jogo** e mostra somente `duracao_jogo` positivo/finito em segundos, para jogos concluídos; dado ausente/inválido fica `—`. Não se calcula tempo efetivo sem início/fim efetivos comprovados. |
| D03 | Causa confirmada e corrigida | A consulta operacional do mesário exclui estados concluídos. O histórico agora pede explicitamente `visao=chaveamento`; a autorização limita o mesário à edição ativa e mantém o filtro operacional padrão para agenda/preparo offline. |
| D04 | Defeito de cliente confirmado e corrigido | A rotina anterior navegava no `finally`, mesmo quando o POST falhava; o teste feliz não cobria falhas. Um manipulador comum agora só navega após resposta redirecionada, mesma origem e destino canônico de login. Cancelamento, 403, falha de rede e HTML 200 deixam a sessão ativa e permitem retry. O tráfego da tentativa original da homologação não foi preservado, então não se atribui a ela um status específico. |
| D05 | Verificado; sem mudança de regra | A fixture automatizada de seis equipes percorre três confrontos iniciais, avanço por bye sem partida e mais semifinal/final: cinco partidas reais, sem duplicar ou pontuar o nó virtual. O bye observado não demonstrou violação do contrato atual. |

Limite de S00: o relatório original não guardou payloads nem captura de Network/console. O diagnóstico exato das antigas respostas foi completado pela leitura de rotas/consumidores e por regressões HTTP e navegador que simulam as condições de erro. Não houve alteração de SQL/schema; portanto não foi necessária migração nem execução da matriz MySQL.

## Reprodução controlada do comportamento anterior (24/09/2026)

Antes de validar as regressões atuais, extraí por `git show` os arquivos do pai do commit de correção `55e3c11` (`1ac473ce`) e executei uma fixture JavaScript em memória, sem substituir arquivos do checkout. Resultados observados:

| Defeito | Reprodução e resultado | Causa registrada |
| --- | --- | --- |
| Indicador de campeões | Final concluída `PL:96:0:MM:2:0:N` com vencedor estruturado exibiu `0`. | O contador pré-fix só reconhecia nome começando por `MM:2:`; a árvore e o resumo usavam critérios diferentes. |
| Duração | `data_inicio_real=2026-09-24 08:00:00`, `termino_jogo=08:05:00` e duração configurada de 300 s produziram `NaNmin`. | A concatenação do datetime SQL com `T` cria data inválida; o cálculo não verifica `Number.isFinite`, e o término é agendado. |
| Histórico do mesário | Rastreamento do controlador anterior confirmou `operacional=1`; o gateway limita essa lista aos estados `Agendado`, `Iniciado` e `Pausado`. | Jogos `Concluido`/`Finalizado` ficam fora da consulta operacional. Nesta reprodução não rodei a API pré-fix contra um banco; a regressão HTTP atual cobre a rota corrigida em container. |
| Logout | Executei o handler inline anterior com resposta HTTP 403 controlada; o destino mudou para `/login`. | O `.finally()` navegava sem validar o resultado do POST. O código anterior não tinha handler comum para erro nem permitia retry confiável. |

Os arquivos pré-fix foram usados apenas para reprodução. As regressões já presentes no commit `55e3c11` são verificadas abaixo no checkout atual. Baseline atual anterior à atualização deste STATUS: `npm test` passou com 137/137; `composer test:unit` passou com 390 testes e 2694 assertions, com uma depreciação PHPUnit reportada. A reprodução está no console desta execução; ela não simula a tentativa manual original nem fornece status de rede daquela homologação.

## Etapas

| Etapa | Estado | Resultado observado |
| --- | --- | --- |
| S00 — Baseline e causa | Concluída, com limite descrito | Inspeção de controlador, gateway, árvore, duração e logout; regra de seis equipes fixada por jornada automatizada. |
| S01 — Regressões primeiro | Concluída | Coberturas JS, HTTP e Playwright para campeão, estatísticas/histórico, duração, escopo por perfil/edição, logout e jornada offline. |
| S02 — Indicadores | Concluída | Cinco jogos reais, zero pendentes e um campeão, após sincronizar a final, tanto na árvore quanto no resumo. |
| S03 — Histórico do mesário | Concluída | Visão de leitura separada da consulta operacional, protegida no servidor e limitada à edição ativa para mesário. |
| S04 — Tempo do jogo | Concluída | Duração configurada finita sob rótulo explícito; partidas sem duração válida não exibem `NaN` nem inferência do término agendado. |
| S05 — Sair | Concluída | Handler comum; cancelamento, falhas e sucesso observáveis; GET não encerra a sessão. A última correção ao teste espera a execução do interceptador antes de avaliar seu contador. |
| S06 — Jornada e gate | Concluída | Execução final completa e sem retry/flake, prints de administrador/mesário e `git diff --check` limpo. |

## Aceites

| Aceite | Estado | Evidência/limite |
| --- | --- | --- |
| V01 | Aprovado | Unitário e jornada confirmam final `PL:` com vencedor e ausência de campeão sem resultado confirmado. |
| V02 | Aprovado | Cobertura inclui contagem por modalidade e modalidade individual pelo ranking confirmado. |
| V03 | Aprovado | Jornada E2E mostra cinco partidas reais concluídas, zero pendentes; bye não soma como partida. |
| V04 | Aprovado | Admin e mesário veem as cinco linhas do histórico; evidências finais abaixo. |
| V05 | Aprovado | Integração testa edição ativa do mesário, outras edições, aluno/admin e valores de `visao`; leitura não amplia mutação. |
| V06 | Aprovado | Consulta operacional segue seu contrato e jornada offline/sincronização continua passando. |
| V07 | Aprovado | Valores finitos em segundos são mostrados como duração configurada; ausente, não finito, zero e jogo não concluído usam marcador. |
| V08 | Aprovado | Playwright conclui cinco placares offline, sincroniza e confere árvore, resumo e histórico sem duplicidade. |
| V09 | Aprovado | Integração e navegador cobrem cancelamento, POST com CSRF, GET seguro, sessão encerrada e bloqueio de reentrada. |
| V10 | Aprovado | Navegador cobre HTTP 403, conexão abortada e HTTP 200 com HTML; a sessão permanece ativa e a tentativa posterior funciona. |
| V11 | Parcial | O fluxo compartilhado foi verificado com admin e mesário e os caminhos aluno/admin carregam a fonte comum; não há matriz nova de logout manual para os quatro papéis em todos os breakpoints. |
| V12 | Aprovado | Integração e navegador repetem ciclos de abrir/revisar/gerar/republicar antes da liberação, depois completam os resultados. |
| V13 | Aprovado | Cenário de seis equipes valida a árvore e as cinco partidas, incluindo bye sem partida/pontuação. |
| V14 | Aprovado | Teste e capturas admin/mesário mostram as mesmas datas/horários para os cinco confrontos; payloads e edição coincidem. |
| V15 | Parcial | Rodaram regressões responsivas/foco e contrato visual desktop/mobile; as novas capturas da página do chaveamento são desktop, sem snapshot de referência móvel dedicado. |

## Execução final e artefatos

- Ambiente: runner oficial `tools/test-docker.ps1`, Docker Compose descartável, MariaDB 10.11, PHP 8.4; iniciado às `2026-09-24 09:06:10` e concluído às `09:18:20` America/Sao_Paulo. Sem banco de trabalho e removido após a execução.
- Comando: `powershell -ExecutionPolicy Bypass -File tools/test-docker.ps1 -Database mariadb -IncludeVisual`.
- Resultado: status `passed`, exit code 0, 730,033 s; qualidade/build/lint/análise passaram; integração **1060/1060**; navegador **172/172**, sem skips, falhas ou flakes; contrato visual **2/2** (desktop e mobile), sem retry. O aviso do PHP-CS-Fixer sobre estar executando em PHP 8.4 enquanto o mínimo do projeto é 8.2 é informativo e não causou falha.
- Run ID: `20260924_120610_9da6c5`. Manifest: [run-manifest.json](../../test-results/docker-20260924_120610_9da6c5/run-manifest.json); logs do ambiente: [docker-compose.log](../../test-results/docker-20260924_120610_9da6c5/docker-compose.log); [tempos de integração](../../test-results/docker-20260924_120610_9da6c5/integration-timings.json); [relatório do navegador](../../test-results/docker-20260924_120610_9da6c5/browser-playwright.json); [relatório visual](../../test-results/docker-20260924_120610_9da6c5/visual-playwright.json).
- Capturas finais da jornada: [admin — histórico/chaveamento](../../tests/browser/test-results/docker-20260924_120610_9da6c5/browser/database/cronograma-jornada-e2e-Flu-e043e-final-offline-sincronizadas-database/chaveamento-admin-historico.png) e [mesário — histórico/chaveamento](../../tests/browser/test-results/docker-20260924_120610_9da6c5/browser/database/cronograma-jornada-e2e-Flu-e043e-final-offline-sincronizadas-database/chaveamento-mesario-historico.png). Ambas foram abertas e inspecionadas: contadores 5/1/0, nomes reais das equipes, cinco linhas, duração finita ou `—`, e ausência de `NaN`.

Uma execução anterior do mesmo perfil (`20260924_115240_1079c6`) encontrou uma corrida na asserção recém-adicionada do logout: `waitForRequest` resolve antes do handler de rota atualizar o contador. Corrigido para `expect.poll`; o teste e a suíte passaram limpos no run final. Na mesma primeira rodada, o teste preexistente de PDF teve timeout transitório e passou no retry; no run final não houve falha nem retry. Os artefatos daquela investigação permanecem sob `test-results/docker-20260924_115240_1079c6/`.

`git diff --check` terminou com exit code 0. O Git exibiu somente avisos sobre conversão de finais de linha em arquivos já alterados. O checkout permanece dirty com outras mudanças preexistentes; nenhuma foi descartada, stageada, commitada ou enviada.

## Revalidação do checkout atual

- Ambiente: runner oficial `tools/test-docker.ps1`, Compose descartável, MariaDB 10.11, PHP 8.4. Início `2026-09-24 13:19:32` e fim `13:32:28` America/Sao_Paulo; duração 775,799 s. A primeira tentativa parou antes dos testes porque o sandbox bloqueou o Docker Engine; a execução aprovada usou `DOCKER_CONFIG` vazio em diretório temporário e limpou seu container/base ao final.
- Comando: `powershell -ExecutionPolicy Bypass -File tools/test-docker.ps1 -Database mariadb -IncludeVisual`.
- Resultado do manifesto: `passed`, exit code 0. Qualidade/build/lint/análise estática passaram; integração **1060/1060**; navegador **172/172**; visual **2/2** (desktop e mobile). Os relatórios registram zero skips, falhas inesperadas ou flakes. A qualidade PHPUnit reportou uma depreciação não bloqueante (390 testes, 2694 assertions); `npm test` passou com 137/137.
- Run ID `20260924_161932_295cf6`: [manifesto](../../test-results/docker-20260924_161932_295cf6/run-manifest.json), [log Compose](../../test-results/docker-20260924_161932_295cf6/docker-compose.log), [tempos de integração](../../test-results/docker-20260924_161932_295cf6/integration-timings.json), [relatório Playwright](../../test-results/docker-20260924_161932_295cf6/browser-playwright.json) e [relatório visual](../../test-results/docker-20260924_161932_295cf6/visual-playwright.json).
- Capturas da jornada, abertas e inspecionadas: [admin — chaveamento e histórico](../../tests/browser/test-results/docker-20260924_161932_295cf6/browser/database/cronograma-jornada-e2e-Flu-e043e-final-offline-sincronizadas-database/chaveamento-admin-historico.png) e [mesário — chaveamento e histórico](../../tests/browser/test-results/docker-20260924_161932_295cf6/browser/database/cronograma-jornada-e2e-Flu-e043e-final-offline-sincronizadas-database/chaveamento-mesario-historico.png). Ambas mostram 1 modalidade, 5 jogos, 1 campeão, 0 pendentes, cinco linhas concluídas, duração finita ou `—`, e nenhum `NaN`.
- `git diff --check` terminou com exit code 0; houve apenas avisos de conversão de finais de linha nos arquivos locais já modificados. Nenhuma alteração local preexistente foi descartada, stageada ou commitada.

## Navegador integrado para exploração

A aplicação de demonstração está deixada aberta no navegador integrado em [http://127.0.0.1:8100/edicoes/agenda?id=10](http://127.0.0.1:8100/edicoes/agenda?id=10), servida pelo projeto Compose isolado `sgi-visual-luna-20260924`. O health e o login responderam HTTP 200 durante a preparação; a base de demonstração foi inicializada do zero. A jornada completa foi executada pelos testes oficiais Playwright contra outra base temporária limpa; a tela aberta serve para exploração manual da agenda com a conta de demonstração documentada no README do projeto. A troca de senha foi excluída conforme instrução.

Logs e dados descartáveis da instância aberta ficam em `test-results/visual-luna-20260924/`. Para encerrar apenas essa instância depois da exploração: `docker compose --project-name sgi-visual-luna-20260924 -f compose.test.yml down --volumes --remove-orphans`. A execução oficial acima já limpou seu próprio container/base.
