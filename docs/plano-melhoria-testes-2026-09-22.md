# Plano de melhoria da segurança e velocidade dos testes

Data: 22/09/2026. Revisão inspecionada: `1f60f4e8f4ac8836beb3e5c6f9768d2a6bed89fd`.
Estado: instrumentação, otimizações de build/esperas e cache BuildKit do CI implementados. O retry após falha de rede tem regressão dedicada. Os dois specs sem SQL agora rodam num projeto Playwright de allowlist com worker e saídas próprios; os cenários restantes que usam servidor/banco continuam seriais. A partição passou no teste focal e na suíte completa: 169/169 casos, sem skips ou flakiness. Nesta primeira comparação equivalente, o tempo total caiu de 569,779 s para 558,729 s (11,050 s; 1,9%) e Playwright de 435,696 s para 426,379 s (9,317 s; 2,1%). Uma repetição ainda é necessária para separar o ganho de variação normal. O cache remoto depende de execução real no GitHub Actions. Não há paralelismo sobre a base compartilhada.

## 1. Parecer

A estratégia do AGENTS e do README é correta quanto às proteções: regressões automatizadas, validação por camadas, banco descartável, integração real, navegador e confirmação de persistência offline. Entretanto, a execução pode ser mais eficiente e verificável. O principal caminho é diminuir preparação repetida, dependências entre cenários e esperas desnecessárias, preservando todos os contratos testados.

Não recomendo reduzir a frequência dos controles finais, transferir testes críticos exclusivamente para uma execução noturna, substituir integração por mocks ou aumentar workers sobre a base compartilhada. Recomendo feedback focalizado durante a edição e a mesma validação completa ao concluir, antes do push e no CI. A orientação atual já permite testes relevantes antes de mudanças funcionais; não exige executar tudo após cada edição de arquivo.

Nenhuma bateria finita garante ausência de defeitos. Neste plano, preservar segurança significa conservar os contratos e cenários existentes, comprovar que continuam detectando falhas e tornar execução incompleta, omissões e instabilidade explícitas.

## 2. Organização observada

| Camada | Organização atual | Implicação |
| --- | --- | --- |
| PHPUnit | 75 arquivos `*Test.php` em `tests/Unit`; descoberta pelo `phpunit.xml` | Regras, serviços, infraestrutura e arquitetura sem SQL real. |
| JavaScript | 14 arquivos `*.test.cjs`; `node --test` | Regras e contratos frontend com retorno rápido. |
| Integração | 40 arquivos em `tests/Integration` e um cenário em `tests/E2E`, coordenados por `tests/run_all.php` | Registro manual; IDs e estado são transmitidos entre etapas sequenciais. |
| Navegador | 42 arquivos `*.spec.cjs`, incluindo visual; projetos `database` e `independent`; `fullyParallel: false` | O banco mantém um worker serial; a allowlist de dois specs sem SQL usa um worker separado. |
| Visual | Dois casos parametrizados, quatro screenshots de login | Protege esse contrato específico, não toda a aparência do sistema. |
| Qualidade | Composer validate/verify, build, checks e testes JS | O executor local acrescenta teste PowerShell de cleanup. |
| CI | Jobs separados de qualidade, integração+navegador e visual | PHP 8.4/MariaDB 10.11; PHP 8.2/MySQL 8.4 disponíveis nos executores, não na matriz atual do CI. |

Contagens são de arquivos no checkout, não de cenários nem de cobertura percentual.

Fontes: [AGENTS](../AGENTS.md), [README](../README.md), [guia de testes](testing.md), [runner PHP](../tests/run_all.php), [executor local](../tools/test-local.ps1), [executor Docker PowerShell](../tools/test-docker.ps1), [executor shell](../tools/test-docker.sh), [Compose](../compose.test.yml), [CI](../.github/workflows/ci.yml), [Playwright](../tests/browser/playwright.config.cjs).

## 3. Evidências de desempenho e limitações

Foi inspecionado em memória o `report.json` embutido no relatório local:
`tests/browser/playwright-report/docker-20260922_203437_be1b42/browser/index.html`.

Início registrado: 22/09/2026 20:36:41 UTC, equivalente a 17:36:41 em São Paulo.
O relatório registra 168 testes esperados/aprovados, zero inesperados, zero flaky e zero skipped; duração total de **526,948 s (8min47s)**.

| Arquivo | Soma das durações de seus casos |
| --- | ---: |
| `frontend-regression.spec.cjs` | 100,76 s |
| `tournament-offline.spec.cjs` | 78,11 s |
| `e04-profile-accessibility.spec.cjs` | 56,22 s |
| `e08-edition-setup.spec.cjs` | 19,59 s |
| `mesario-offline.spec.cjs` | 15,39 s |

Os três primeiros somam 235,09 s, aproximadamente 44,6% do tempo total do relatório. Isso indica prioridade de investigação, não que esse tempo possa ser eliminado. Torneios completos online/offline exercitam contratos distintos e devem permanecer.

Este é um relatório histórico local, não uma execução feita nesta análise. Não foi estabelecida a correspondência exata entre seu código e o HEAD inspecionado. O relatório não mede build, inicialização SQL, qualidade ou integração anterior; não permite anunciar tempo total da suíte ou percentual de ganho futuro. Os artefatos são locais e podem ser removidos pela retenção.

O benchmark media o executor host+container de banco e códigos de saída, mas não comparava com o executor Compose completo. Para número par de execuções, selecionava a mediana inferior. A instrumentação agora tem modo `auto` (Compose/PHP 8.4 para suites com banco, host para qualidade isolada), permite escolher o executor, guarda cada execução imediatamente e continua após uma falha para registrar os códigos de saída. A mediana usa os dois valores centrais.

## 4. Oportunidades e riscos comprovados no código

1. **Preparação acoplada à validação.** Os perfis locais `browser` e `visual` chamam toda a integração antes do navegador. O `all` faz isso uma vez, portanto não há duas integrações internas nesse perfil. O custo reaparece ao executar perfis separados. No CI, o visual já sobe app/banco sem executar integração: os caminhos não são equivalentes em preparação.
2. **Builds repetidos.** `Dockerfile.test` compila assets para a aplicação e alguns specs de componente antes carregavam CSS/JS do filesystem do container Playwright, forçando um segundo build. Eles agora usam os assets pela URL pública da aplicação. O build da imagem de navegador pôde ser removido sem omitir essa cobertura; a camada de assets da imagem PHP é cacheável. O CI agora importa caches BuildKit/GitHub Actions separados por imagem: qualidade e visual só leem; integração é a única etapa que exporta, evitando disputa de escrita. Falha ao exportar cache não falha o gate. Nenhum resultado de teste, banco ou sessão é tratado como cache de aprovação.
3. **Serialização geral.** O navegador separa `bootstrap-components.spec.cjs` e `offline-queue-regression.spec.cjs` em um projeto de allowlist com um worker próprio. Esse projeto não acessa SQL; os demais specs permanecem em `database`, serial com um worker. Os próximos candidatos precisam ser auditados por dependência de SQL, estado global e sessão antes de receber a mesma classificação.
4. **Esperas que mereciam revisão.** `frontend-regression.spec.cjs` continha `networkidle` com limite de 8 s e erro ignorado, além de pausas de 350 ms; `offline-tournament-bracket.spec.cjs` continha pausa de 2 s. Foram substituídas por seletores de conteúdo, dois frames de renderização e captura com animações desativadas. Nas telas responsivas, os testes aguardam conteúdo específico e mantêm as asserções de geometria. Essa alteração ainda precisa de execução repetida para verificar estabilidade e medir ganho. Timeouts são tetos, não atrasos obrigatórios. Não reduzir globalmente os 180 s por teste ou os 20 s de expectativa sem diagnóstico.
5. **Dependência entre cenários de integração.** O runner passa edição, turma, modalidade, equipes e jogos entre classes. Uma exceção aborta os casos seguintes. Um filtro ingênuo ou execução paralela quebraria essa preparação; rollback externo não isola chamadas HTTP, processos concorrentes ou DDL.
6. **Paridade incompleta.** Compose e o executor local selecionam `individual-ranking.spec.cjs`. O teste PowerShell de cleanup continua específico do executor Windows e não roda no serviço Docker de qualidade; a diferença de plataforma deve permanecer explícita.
7. **Evidências.** Playwright agora reprova casos flaky; relatórios e resultados do CI são publicados também em sucesso. Manifestos por execução registram seleção, estado, etapas e caminhos dos relatórios; o runner registra duração/estado por classe de integração. A lista esperada/real de cada etapa ainda deve ser tratada com cuidado quando uma preparação interrompe a execução.
8. **Saídas.** Os wrappers agora separam destinos browser/visual e passam os caminhos para o Compose; o CI publica os resultados com retenção de sete dias. Falhas de cleanup ainda precisam ser cobertas nos testes de contrato dos wrappers.
9. **Documentação divergente.** AGENTS descreve o schema como resultado de todas as migrations; o README e `TestDatabase::resetFromSchema` usam `database/schema-inicial.sql`/`SchemaInstaller`. A documentação ativa agora identifica `legacy-offline-compat.spec.cjs` como histórico e o README do navegador cita referências visuais para Windows e Linux. Registros de validação antigos que poderiam ser confundidos com instruções atuais também estão sendo identificados como históricos.

## 5. Implementação proposta, em ordem

### Etapa 1 — Medição, inventário e paridade

Arquivos principais: wrappers, benchmark, runner PHP, configuração Playwright, Compose e CI.

- Produzir manifesto JSON por execução: identificador, revisão e estado sujo do checkout, versões de runtime/motor/browser, perfil, seleção, início/fim UTC, duração monotônica, exit code e caminhos dos logs. Não capturar segredos do ambiente.
- Medir build, qualidade PHP, JS, preparação SQL, integração por classe, navegador, visual e cleanup. Registrar também falha na preparação e etapa não iniciada. **Parcial:** cada classe chamada por `tests/run_all.php` agora registra duração e estado em `integration-timings.json`; preparação e etapas externas seguem no manifesto dos wrappers.
- Adicionar resultados estruturados PHPUnit/Playwright e inventário de IDs esperados versus executados. Etapa omitida/abortada não pode contar como aprovada. Registrar retries, skips e testes instáveis.
- Fixar execução do ranking individual no perfil local completo; tornar a regressão de cleanup obrigatória em job Windows apropriado e declarar a diferença de plataforma.
- Separar resultados browser/visual nos dois wrappers; testar propagação de diretórios e falhas de cleanup.
- **Implementado:** corrigir a mediana e adicionar modos `host` (aplicação no host + banco Docker) e `compose` (app, banco e navegador em containers). O relatório é atualizado após cada execução e continua mesmo diante de stderr/falha. Foram feitas três passagens completas equivalentes em Compose; falta comparação repetida entre configurações se a escolha de executor precisar ser otimizada. A evidência atual não justifica trocar o executor recomendado.

Aceitação: mesmas seleções esperadas nos caminhos equivalentes; relatório incompleto reprova; falha em qualquer filho ou cleanup não produz sucesso; saídas de visual não apagam as de navegador. Esta etapa melhora segurança antes de buscar ganho de tempo.

### Etapa 2 — Cache e build sem execução redundante

Arquivos: Dockerfiles, `.dockerignore`, Compose e workflow.

- Separar camadas de dependências, fontes necessárias ao build e código de testes. Usar cache por lockfiles, runtime e plataforma; manter `composer install`/`npm ci` reproduzíveis.
- Compartilhar um estágio/artefato de assets entre imagens quando viável; validar que os arquivos servidos pela aplicação correspondem aos fontes da revisão testada.
- **Implementado:** retirar a compilação redundante da imagem do browser; os specs de componente carregam os assets publicados pelo app. A imagem PHP ainda compila os assets da revisão em teste e essa etapa é verificada pelo perfil de qualidade.
- **Implementado:** CI prepara um builder Buildx com `docker/setup-buildx-action` e constrói imagens via `docker/bake-action`; a cache GHA tem scopes separados para app e browser. As etapas de qualidade/visual importam; integração importa e exporta. O scope de browser inclui a versão Playwright. Chaves de cache são invalidadas por inputs de build/lockfiles pelo BuildKit; `ignore-error=true` torna apenas a exportação opcional.
- Cachear camadas de build, nunca resultado verde, banco mutado, sessão autenticada ou fila offline. Não há cache de aprovação dos testes.

Aceitação: execução fria e aquecida equivalentes; alteração em JS/CSS/token/lockfile invalida o necessário; asset ausente/obsoleto causa falha; todos os testes continuam presentes. Medir ganho antes de expandir a solução. **Localmente**, os três builds Compose completos executaram; ainda não há uma execução remota do workflow que demonstre hit/miss do cache GitHub entre jobs/commits.

### Etapa 3 — Esperas determinísticas e preparação do navegador

Arquivos iniciais: os três specs mais demorados, helpers e fixtures.

- Medir login, criação de fixtures, preparo offline e corpo do teste separadamente nos arquivos mais lentos.
- **Implementado e repetido:** em `frontend-regression.spec.cjs`, substituir `networkidle` tolerado por verificações explícitas de conteúdo e pausas de screenshot por dois frames; em `offline-tournament-bracket.spec.cjs`, substituir o atraso de 2 s pela presença dos elementos da tela. Três execuções completas passaram sem retry/flakiness. O relatório atual mede `frontend-regression.spec.cjs` em 42,23–44,19 s, mas o histórico de 100,76 s é de executor diferente; não atribuir esse delta como ganho comprovado. Ainda falta revisar outros specs lentos.
- Preservar janelas de observação que verificam ausência de reload ou duplicação; uma verificação instantânea poderia deixar de detectar efeitos tardios. Usar relógio controlado apenas quando não esconder o comportamento real sob teste.
- Centralizar preparação repetida e usar API autenticada/CSRF real para dados acessórios. Manter os testes explícitos de login, edição, permissões, inscrição e navegação pela interface.
- Evitar compartilhar sessão/estado entre testes de senha, revogação, primeiro acesso ou isolamento de operador. Não pular o preparo real da casca nos cenários offline completos.

Aceitação: cada espera nova falha quando a condição esperada não ocorre; cenários de sucesso, erro e reentrada continuam protegidos; comparar estabilidade com repetições e traces antes/depois. Não remover os torneios para atingir meta de tempo.

### Etapa 4 — Preparação independente e paralelismo seguro

Arquivos: runner PHP, fixtures, Compose, wrappers, configuração Playwright e CI.

- Separar instalação/fixtures dos testes que validam criação dessas entidades. Criar preparadores determinísticos, com contratos próprios, para navegador e grupos de integração.
- Manter os testes atuais de criação/migração/recuperação na validação completa. A nova fixture não os substitui.
- **Implementado e validado no gate completo:** `bootstrap-components.spec.cjs` e `offline-queue-regression.spec.cjs` têm seleção fixa no projeto `independent`; os 31 casos passaram e se sobrepuseram aos cenários de banco. O atalho da fila passou 27/27 sem servidor/SQL. Esses casos não são removidos da suíte completa.
- O projeto `database` mantém um único worker. Os diretórios de screenshots/traces por projeto são separados; o relatório JSON/HTML agrega a execução Playwright. Não existe flag genérica que permita executar specs arbitrários sem a proteção SQL.
- Depois, testar dois grupos de navegador com ambientes exclusivos: app, banco, projeto Compose, sessões, uploads, portas, bases auxiliares e relatórios. A base compartilhada atual continua com um worker.
- Separar grupos de integração apenas após eliminar dependências de IDs/estado. Manter cenários de corrida com suas conexões/processos e barreiras reais.
- Balancear grupos pelas durações medidas, considerando CPU/RAM e o servidor PHP. IDs de edição diferentes não bastam se existir configuração global de edição ativa.
- Executar qualidade e grupos comprovadamente independentes em paralelo somente após isolar os arquivos de saída/cache. A aprovação final agrega todos os grupos obrigatórios.

Aceitação: cada grupo passa sozinho, em ordem diferente e simultaneamente com outro grupo; não lê dados/sessões do vizinho; falhas não são escondidas por retries; nenhuma seleção fica fora do manifesto completo. Se o isolamento falhar, manter serialização e corrigir a causa.

**Prioridade baseada no perfil medido:** o maior grupo serial é `tournament-offline.spec.cjs` (mediana 74,03 s), seguido por `e04-profile-accessibility.spec.cjs` (51,42 s) e `frontend-regression.spec.cjs` (43,27 s). Os dois specs independentes têm duração pequena; sua divisão pode sobrepor parte do trabalho com o fluxo SQL, mas não altera a quantidade de cobertura nem permite paralelizar os maiores casos. Como estes usam o app e validam persistência/permissões, paralelismo adicional requer fixtures e DB exclusivos.

**Próximo passo após validar esta partição:** os casos mais longos continuam sendo os torneios online (34,9 s nesta execução) e offline (38,8 s), que concluem sete partidas e validam resultado/campeão no servidor; os uploads de foto do aluno (15,2 s) e administrador (13,7 s), que cobrem sessão, upload, navegação e remoção; além de telas com dados reais e acesso por perfil. Eles alteram ou confirmam dados e/ou permissões, então permanecem no projeto `database`. Particioná-los exige bancos/sessões independentes e fixtures verificáveis por grupo, mantendo os testes de criação e a passagem serial atual até que cada grupo passe sozinho, em ordem diferente e em paralelo.

### Etapa 5 — Política documentada e prova de preservação

Atualizar AGENTS, README, `docs/testing.md` e README do navegador juntos, somente após implementar e validar os comandos.

| Momento | Política proposta |
| --- | --- |
| Antes de correção funcional | Testes existentes relevantes, como já exigido; registrar baseline. |
| Antes/depois de refatoração | Preservar suíte completa. |
| Durante edição | Regressão focalizada e testes das fronteiras afetadas; feedback parcial claramente identificado. |
| Conclusão funcional e antes de push | `all` obrigatório, visual quando aplicável, motores SQL pertinentes; todos aprovados no estado final. |
| CI de PR | Manter todos os controles atuais, com agregação obrigatória dos grupos e evidência preservada. |
| Documentação/estilo | Manter proporcionalidade atual; não reclassificar mudanças funcionais como estilo. |

Uma execução completa já aprovada para exatamente o mesmo estado de código, testes, configuração, dependências e runtime pode atender à conclusão e ao pre-push sem repetição mecânica. Isso exige identidade verificável de todos os inputs e nenhuma alteração posterior; não implementar inicialmente como cache automático de aprovação.

Adicionar uma matriz contrato → testes → camada, priorizando autenticação/revogação, RBAC/edição, CSRF, atomicidade, idempotência, concorrência, pontos/placar, avanço de chaveamento e recuperação de fila. Demonstrar em ambiente descartável que falhas deliberadas representativas continuam sendo detectadas antes/depois. Esse ensaio complementa o inventário; contagem igual de testes ou aumento de cobertura de linhas, isoladamente, não comprova preservação da proteção.

Investigar os testes instáveis em vez de aceitá-los como verdes após retry. Adicionar reprovação explícita para flaky no gate completo, com diagnóstico por tentativa. Configuração desconhecida ou seleção vazia deve falhar, não passar silenciosamente.

## 6. Critérios de sucesso e execução incremental

1. Nenhum contrato removido, teste omitido ou asserção enfraquecida; alterações de organização mantêm rastreabilidade do cenário original.
2. Todos os requisitos atuais de isolamento, HTTP, banco, navegador, visual aplicável e motores pertinentes continuam atendidos.
3. Comparações usam a mesma revisão, máquina, runtime, fixtures e seleção. Separar tempo até primeira falha, tempo completo, preparação, cache frio/aquecido e consumo de recursos.
4. Aceitar ganho somente se superar a variabilidade das medições repetidas e não aumentar instabilidade. Não prometer percentual antes do baseline instrumentado. Usar percentis apenas quando houver amostra suficiente; três medições servem para comparação inicial por mediana/faixa.
5. Validar alterações nos executores com falha de comando filho, falha de setup, timeout, interrupção, cleanup e combinação de opções. Nunca testar reset destrutivo fora de containers descartáveis.
6. Entregar cada etapa em mudança separada. Para refatorações dos executores, rodar suíte completa antes/depois; executar `all` e visual aplicável ao concluir. Conservar a configuração serial como retorno seguro até o paralelismo ser comprovado.

Prioridade prática: **instrumentação/paridade → cache/build → esperas/preparo → isolamento/paralelismo → revisão documental da política**. Reduzir frequência dos controles finais não é parte da proposta.

## 7. Verificação desta análise

Na análise inicial, foram inspecionados código/configuração/documentação e um relatório existente com `git status --short`, `git rev-parse HEAD`, `rg --files`, buscas `rg`, leitura dos executores e extração em memória do ZIP embutido no HTML Playwright. Na implementação atual foram alterados wrappers, Dockerfiles, Compose, CI, runner PHP, specs e documentação. As verificações sintáticas PowerShell, a configuração Compose e a definição Bake foram conferidas localmente; o workflow GitHub Actions em si não foi executado nesta revisão.

Em 22/09/2026 (UTC 23/09), foi executado `powershell -ExecutionPolicy Bypass -File tools/benchmark-tests.ps1 -Suite all -Runs 3 -Runner compose -PhpVersion 8.4 -Database mariadb`. O agregado é `test-results/benchmark-20260922_211759_ff88d1.json`; manifests, tempos de integração e JSON do Playwright ficam em `test-results/docker-20260923_001759_cb7bac/`, `test-results/docker-20260923_002732_3627b0/` e `test-results/docker-20260923_003707_ec1f9d/`.

| Rodada | `all` completo | Playwright | Esperados | Ignorados | Inesperados | Flaky | Asserções HTTP |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 572,678 s | 432,500 s | 168 | 0 | 0 | 0 | 1.016/1.016 |
| 2 | 574,526 s | 439,951 s | 168 | 0 | 0 | 0 | 1.016/1.016 |
| 3 | 578,627 s | 445,103 s | 168 | 0 | 0 | 0 | 1.016/1.016 |
| Mediana | **574,526 s (9 min 34,5 s)** | **439,951 s (7 min 20,0 s)** | 168 | 0 | 0 | 0 | 1.016/1.016 |

Depois dessas medições foi incluído um caso determinístico de retry após falha de rede. A execução final do checkout resultou em **569,779 s** para `all`, sendo **435,696 s** no Playwright, com **169/169** aprovados, zero ignorados, inesperados ou flaky e **1.016/1.016** asserções de integração. O manifesto é `test-results/docker-20260923_010434_fec99b/run-manifest.json`; os resultados Playwright e integração ficam no mesmo diretório. Essa execução final tem inventário diferente e não deve ser combinada como quarta repetição da mediana de 168 casos.

Após separar os projetos `database` e `independent`, a mesma seleção de 169 casos passou em **558,729 s**, sendo **426,379 s** no Playwright. Foram executados 138 casos `database` e 31 `independent`; todos passaram, sem skips, resultados inesperados ou retries. O independente iniciou junto ao projeto do banco e terminou em cerca de 16 s, enquanto o projeto de banco continuou até 09:11:30 UTC. O manifesto atualizado é `test-results/docker-20260923_090237_9c2df8/run-manifest.json`. A comparação com a execução anterior é equivalente em seleção, ambiente Compose, PHP 8.4 e MariaDB 10.11, mas representa uma passagem por estado; tratar os ~2% observados como preliminares até novas repetições.

O tempo de qualidade foi 24,13–25,44 s; integração HTTP/banco, 80,91–84,44 s; subida de app/banco, cerca de 9,3 s; o comando Docker do browser, 440,78–453,22 s; cleanup, cerca de 5,1 s. Os três containers, volumes e redes foram removidos ao final de cada execução. Todas as rodadas usaram o mesmo HEAD (`1f60f4e8f4ac8836beb3e5c6f9768d2a6bed89fd`) com working tree sujo que continha as alterações sob teste, PHP 8.4 e MariaDB; o relatório não valida PHP 8.2/MySQL, visual ou o CI remoto.

Nos relatórios Playwright, as somas de duração por arquivo mais altas foram: `tournament-offline.spec.cjs`, 73,60–75,12 s; `e04-profile-accessibility.spec.cjs`, 48,28–51,42 s; `frontend-regression.spec.cjs`, 42,23–44,19 s; `e08-edition-setup.spec.cjs`, 18,96–19,46 s; `mesario-offline.spec.cjs`, 14,06–14,43 s. O projeto Playwright registrou zero retry, zero flaky e zero skipped em todas as rodadas.

Isso comprova que a seleção e execução paralela dos dois projetos preservou a suíte neste ambiente. O comando focal `npm --prefix tests/browser run test:offline-queue` também passou 27/27. `docker compose -f compose.test.yml config --quiet`, a expansão local de `docker buildx bake --print` e `git diff --check` foram conferidos. Não houve parser YAML dedicado neste host. A redução de tempo frente à passagem anterior comparável é inicial, ainda não repetida; o relatório histórico de 526,948 s é somente navegador e veio de executor/plataforma diferentes, então não serve de baseline causal. A execução não representa CI remoto. A cache BuildKit do workflow só pode ser validada entre execuções GitHub Actions.
