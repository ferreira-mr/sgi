# Guia de engenharia do SGI

Este arquivo orienta agentes de IA e desenvolvedores na manutenção e evolução do Sistema de Gestão de Interclasses do SESI. Aplica-se a todo o repositório.

Para instalar e explorar a aplicação, siga o [README](README.md). Consulte também [arquitetura](docs/architecture.md), [testes](docs/testing.md) e [implantação e recuperação](docs/deployment.md). Ao alterar um fluxo, confira sua implementação, rotas, migrações e testes atuais; exemplos históricos na documentação não substituem esses contratos.

## 1. Contexto e mapa do código

O SGI é uma aplicação web monolítica modular em PHP 8.2+ com MySQLi e MySQL/MariaDB, HTML, CSS e JavaScript sem framework de frontend. Gerencia edições, participantes, competições, resultados, arrecadações e disciplina. O mesário opera offline depois de preparar a sessão e os dados no navegador.

| Local | Responsabilidade |
| --- | --- |
| `public/index.php` | Única entrada HTTP; o servidor publica somente `public/`. |
| `bootstrap/autoload.php` e `bootstrap/app.php` | Autoload, ambiente e composição da aplicação. |
| `config/routes.php` | Rotas `/api/v1` e composição explícita das dependências. |
| `config/routes/web.php` | Rotas das páginas. |
| `src/Modules/` | Módulos `Acesso`, `Eventos`, `Participantes`, `Competicoes`, `Resultados`, `Disciplina` e `Sincronizacao`. |
| `src/Shared/` | Infraestrutura e contratos compartilhados de HTTP, configuração, transações e armazenamento. |
| `resources/views/` | Templates e componentes privados. |
| `resources/js/`, `resources/css/`, `resources/images/` | Fontes dos assets. |
| `public/assets/` | Saída gerada pelo build, não versionada. |
| `database/migrations/` | Esquema e evolução versionada do banco. |
| `database/seeders/` | Fixtures exclusivos de testes. |
| `storage/` | Sessões, uploads e importações, fora da raiz pública. |
| `tests/` e `tools/` | Testes, build e executores de validação. |

Não recrie o módulo genérico `Interclasses` nem endpoints PHP procedurais. O nome da URL não determina o módulo: `/api/v1/resultados`, por exemplo, é atendido por `Competicoes/Presentation/Http/ResultadoController`, enquanto ranking e pontuação geral pertencem a `Resultados`.

## 2. Novas implementações e fronteiras entre camadas

- **Domain:** regras e contratos de negócio.
- **Application:** casos de uso que coordenam regras, repositórios e contratos de transação.
- **Infrastructure:** SQL, persistência, arquivos e implementações dos contratos.
- **Presentation/Http:** adaptação de requisições, autorização e respostas; sem SQL ou transações diretas.

`Domain` e `Application` não acessam superglobais HTTP/sessão, MySQLi, `ConnectionFactory` ou classes de apresentação/infraestrutura. Para transações coordenadas por um serviço, use `TransactionRunner`, implementado por `MysqliTransactionRunner`; não abra transações SQL no serviço.

Componha as dependências em `config/routes.php`. Entre módulos, prefira contratos e serviços públicos existentes; não importe implementações concretas de outro módulo em controladores. As exceções atuais verificadas em `tests/Unit/Architecture/` não autorizam ampliar o acoplamento em código novo. Evite criar abstrações sem necessidade do caso de uso.

Normalize e valide entradas antes de persistir; mantenha também as restrições necessárias no banco. Use consultas preparadas para valores externos e listas permitidas para identificadores SQL dinâmicos. Preserve a atomicidade de operações que alteram mais de uma entidade, incluindo resultado, avanço de chaveamento e pontuação. Transações aninhadas usam a infraestrutura existente com savepoints.

Ao corrigir um defeito, cubra o comportamento que falhava com um teste de regressão na camada adequada. Uma mudança de caso de uso deve ter cobertura unitária; alterações no contrato público exigem teste HTTP. Não enfraqueça validações, regras de arquitetura ou asserções para fazer a suíte passar.

## 3. Permissões, sessão e segurança

| `nivel_usuario` | Perfil | Escopo |
| --- | --- | --- |
| `0` | Administrador | Gestão completa, incluindo edições, usuários e configurações. |
| `1` | Colaborador | Operação administrativa conforme a autorização de cada rota; sem os privilégios exclusivos do administrador. |
| `2` | Mesário | Operação de partidas exclusivamente na edição ativa, online e offline após preparo. |
| `3` | Aluno | Acesso por matrícula, termos, agenda e inscrições em até três modalidades, respeitando as regras da edição. |

A tabela resume os papéis; a permissão concreta deve ser verificada no código e testada no servidor.

- Reutilize `AccessGuard`, `CompetitionAccess`, as políticas de edição e os middlewares existentes. Valide também a edição e o vínculo do recurso solicitado; esconder um botão não protege uma API.
- Preserve a revalidação de sessão por `SessionRevalidator` e o mecanismo `auth_version` ao alterar usuários, senhas ou permissões. Não confie apenas no nível enviado pelo cliente ou em uma sessão antiga.
- Mutações devem respeitar `CsrfGuard`; não crie exceção de CSRF para testes. Os testes obtêm tokens pelo mesmo fluxo da aplicação.
- Use `password_hash($senha, PASSWORD_DEFAULT)` e `password_verify`. O primeiro administrador é criado por `php bin/sgi.php admin:create`; credenciais de fixtures não pertencem às migrações nem à instalação normal.
- Use `Request` e `Response` e mantenha respostas JSON coerentes com o contrato do cliente. Falhas internas devem ir para o log, sem expor SQL, credenciais ou caminhos locais.
- Escape dados ao renderizar HTML e serialize configurações de página como JSON seguro. Não coloque SQL nem programas JavaScript inline em templates.
- Resolva arquivos persistentes por `StoragePaths`. Valide tipo/conteúdo e destino de uploads, além de autorização e vínculo com a edição, antes de salvar. Preserve as proteções e a serialização da importação PDF.
- Não versione `.env`, senhas, uploads ou dados pessoais. Variáveis do processo têm prioridade sobre `.env`; confira o ambiente antes de executar comandos de banco.

## 4. Banco e regras que precisam ser preservadas

O esquema completo resulta de **todas** as migrações em `database/migrations/`, não apenas de `001_initial_schema.sql`. Consulte as migrações e os repositórios antes de assumir nomes de colunas, relações ou valores de status.

As entidades centrais são `interclasses`, `categorias`, `turmas`, `modalidades`, `equipes`, `usuarios`, `equipes_has_usuarios`, `jogos`, `partidas`, `artilheiros`, `ocorrencias`, `ocorrencias_turmas`, `historico_arrecadacoes`, `tipos_modalidades` e `locais`. Há também vínculos de participação/termos, registros de pontuação e controle de sincronização; esta lista não é um inventário exaustivo.

- Matrículas de alunos usam a unicidade por edição `uk_matricula_interclasse` (`matricula_usuario`, `interclasses_id_interclasse`). Não imponha unicidade global que impeça participação em anos diferentes.
- Penalidades são armazenadas como magnitudes não negativas; o ranking aplica o desconto uma vez. Preserve as restrições introduzidas em `009_occurrence_penalty_invariant.sql`.
- Jogos novos usam `exige_vinculo_ponto=1`: preserve a vinculação dos pontos individuais, a chave da jogada, autoria e anulação, e a consistência com o placar. O histórico anterior recebe tratamento explícito em `010_vinculo_obrigatorio_pontos.sql`; não desative a regra dos jogos novos para aceitar um resultado inconsistente.
- Ao alterar ranking ou acesso às edições, considere também os campos de publicação do ranking e as políticas de acesso atuais. Não deduza visibilidade apenas pelo status da edição.
- Preserve as regras de capacidade de equipes, inscrição, gênero, categoria e agendamento nos serviços e nos testes correspondentes.
- Nunca adicione trigger que atualize a mesma tabela que disparou o evento (erro 1442 em MySQL/MariaDB).

Migrações aplicadas são imutáveis: adicione uma nova migração numerada. `MigrationRunner` verifica checksum, trava e estado de aplicação incompleta. Não apague o marcador de falha para forçar uma repetição. DDL pode fazer commit implícito; não presuma rollback transacional de uma mudança de esquema.

Valide instalação vazia, atualização com dados existentes e repetição sem efeitos duplicados. Use os dois motores da matriz para alterações específicas de SQL. Backups e restauração de instalações reais seguem o guia de implantação; os dumps sintéticos de testes não substituem backup de produção.

## 5. Offline e sincronização

O fluxo atual está em `resources/js/offline/` e usa a página `resources/views/pages/competicoes/placar.php` e as APIs versionadas.

| Componente | Responsabilidade atual |
| --- | --- |
| `offline-core.js` | Interceptação de rede, cache GET, fila de mutações e reenvio. Banco `sgi_offline`, stores `api_get_cache` e `mutation_queue`; coordenação entre abas em `sgi_offline_coord`. |
| `mesario-data.js` | Projeções locais em `sgi_mesario_dados`, incluindo jogos, partidas, equipes, atletas, pontos, ocorrências e a projeção `fila_sincronizacao`. Essa store não é a fila principal de transporte. |
| `mesario-offline.js` | Casca SPA previamente preparada; restaura páginas e reinicializa os scripts publicados no formato de cache atual. |
| `chaveamento-engine.js` | Avanço local do mata-mata, com identificadores temporários negativos. |
| `ResultadoController` e `ResultadoService` em `Competicoes` | Recepção e validação de resultados em `/api/v1/resultados`. A composição usa `MysqliPartidaGateway`, `MysqliPontoRepository`, o contrato de transação e o serviço de pontuação. |
| `MutationAction` e `MysqliMutationStore` em `Sincronizacao` | Identidade, serialização de reenvios e confirmação da mutação junto com os dados. |

Para evoluir esse fluxo:

- Preserve os identificadores da mutação nos reenvios, a ordem/dependências da fila e o isolamento por operador/sessão. A mesma chave com outro conteúdo ou operador deve ser recusada.
- Preserve a confirmação atômica entre alteração de dados e registro de idempotência. Reenviar a mesma operação não pode duplicar pontos, ocorrências ou avanço de fase.
- Atualize o token CSRF da sessão ao reenviar; não transporte credenciais antigas em exportações da fila.
- Só remova operações após confirmação de sucesso reconhecida pelo protocolo. HTTP 200 com HTML, JSON inválido ou resultado de erro não é confirmação. Operações recusadas permanecem disponíveis para revisão.
- Resolva jogos temporários pela lógica existente, incluindo modalidade, edição, tag do chaveamento e participantes; não escolha arbitrariamente um jogo quando a resolução for ambígua.
- Preserve o schema e dados offline enquanto houver operações pendentes. Uma mudança de versão exige estratégia explícita de migração/recuperação e testes; limpar IndexedDB não é uma correção aceitável para perda de sincronização.
- A entrega não exige recriar APIs procedurais de versões anteriores. Isso não permite remover os aliases/formatos que ainda são necessários para filas persistidas e cobertos pelos testes atuais.

Não há Service Worker. Login e preparação exigem conexão; refresh, nova aba ou abertura fria sem rede não são fluxos suportados. Teste na mesma aba preparada. Para um servidor em `127.0.0.1`, use Offline no DevTools/Playwright: desligar o Wi-Fi não interrompe o loopback.

## 6. Frontend, URLs e ciclo de vida

Edite as fontes em `resources/` e, durante o desenvolvimento local, use `npm run dev` para iniciar o servidor PHP, observar as fontes, recompilar os assets alterados e recarregar o navegador. Use `npm run build` para um build isolado, CI e preparação de implantação. Não edite a saída `public/assets/` nem dependa de CDN para os recursos necessários offline. Preserve os lockfiles e o build reproduzível; atualize dependências deliberadamente, sem executar atualizações gerais como parte de uma correção não relacionada.

Para qualquer mudança de estilização, planeje primeiro um design system coeso e alinhado aos padrões já existentes, contemplando tokens reutilizáveis de cores, tipografia, espaçamento, raios, sombras, estados, breakpoints, componentes e acessibilidade. Reutilize ou estenda os estilos compartilhados em `resources/css/`; não crie novos arquivos CSS, não aplique CSS inline em HTML/PHP/JavaScript e não espalhe estilos pontuais em templates. Centralize tokens e padrões, prefira componentes e classes reutilizáveis e valide responsividade, contraste, foco/teclado e o impacto nas páginas existentes. Se a base compartilhada não oferecer suporte suficiente, organize-a antes de estilizar uma tela isolada.

Use `Assets`/`Url` para URLs e `SGI_ROOT` para includes. Novas APIs ficam em `/api/v1`; não crie chamadas relativas a arquivos PHP físicos nem links fixos em `/SGI`. Confira raiz e subdiretório quando alterar roteamento ou geração de URLs.

Siga `resources/js/shared/page-runtime.js` e os utilitários compartilhados. Inicialização e reativação de página devem evitar duplicar listeners, timers, requisições periódicas e ações de modais. Ao sair da página, libere os recursos correspondentes. Verifique navegação normal e reentrada pela casca offline.

## 7. Testes e critérios de entrega

Antes e depois de refatorações, execute a suíte completa em ambiente isolado. Para mudanças funcionais, adicione a cobertura adequada e execute as verificações de qualidade e as suítes afetadas; antes da entrega de uma implementação, valide também integração e navegador. Alterações exclusivamente documentais exigem conferir caminhos, links e comandos com o código, além de `git diff --check`; não exigem recriar o banco ou executar toda a aplicação.

### Proporcionalidade para estilo, commits e publicação

- Alterações exclusivamente de estilo, sem mudança de comportamento ou contrato, não precisam ser seguidas imediatamente de um commit. Elas podem ser agrupadas em um commit coerente ou permanecer em revisão até que a alteração esteja pronta para integração.
- Para uma alteração de estilo pequena e de baixo risco, a bateria completa de testes pode ser adiada; faça, porém, as verificações proporcionais ao escopo, como inspeção do diff, `git diff --check`, build e validações de frontend/visual quando forem relevantes.
- Se a alteração de estilo for ampla, transversal, atingir estilos compartilhados, templates, responsividade, acessibilidade, ciclo de vida, JavaScript ou assets, ou apresentar risco de afetar comportamento, execute imediatamente as suítes afetadas e a suíte completa quando o risco justificar. Não use a classificação “estilo” para adiar testes de uma mudança funcional disfarçada.
- Antes de qualquer `push` para o GitHub, execute a bateria completa exigida pelo projeto em ambiente isolado e aguarde a aprovação de todos os testes aplicáveis. Para alterações visuais, inclua também `-IncludeVisual`/`--include-visual`; não faça push com falhas, resultados incompletos ou validações não executadas, nem mascare falhas preexistentes como aprovação. O CI do GitHub continua sendo obrigatório e deve permanecer verde.

### Preparação e execução recomendada

O [README](README.md) explica a instalação das ferramentas. Na raiz do projeto:

```powershell
composer install
npm ci --ignore-scripts
npm ci --prefix tests/browser
npx --prefix tests/browser playwright install chromium
```

No Windows, use o executor que cria o banco em container descartável e prepara
servidor, sessões e uploads de teste:

```powershell
powershell -ExecutionPolicy Bypass -File tools/test-docker.ps1 -Database mariadb
```

Os perfis `integration`, `browser`, `visual` e `all` que acessam o banco devem
ser executados somente por `tools/test-docker.ps1`/`.sh` ou por
`tools/test-local.ps1`, que também cria um container Docker descartável. Não
configure `SGI_TEST_DB_HOST`, `SGI_TEST_DB_PORT`, `SGI_TEST_DB_USER` ou
`SGI_TEST_DB_PASSWORD` para apontar a testes; essas variáveis não fazem parte do
contrato atual. Não execute `php tests/run_all.php`, Playwright, seeds ou
`tools/start-test-server.ps1` contra um MySQL/MariaDB local. O runner recusa a
execução sem `SGI_TEST_DB_RUNTIME=container` antes de qualquer reset.

`quality`, testes unitários, lint, análise estática e testes JavaScript que não
abrem conexão SQL continuam podendo ser executados sem Docker. O container de
teste é criado uma vez por execução da suíte, compartilhado pelos cenários
encadeados e removido ao final. `-Keep`/`--keep` é apenas uma exceção explícita
para investigação e deixa o ambiente sob responsabilidade de quem o utilizou.

Na suíte Playwright, `database` mantém um worker serial para specs que dependem
do servidor/banco compartilhado. Somente `bootstrap-components.spec.cjs` e
`offline-queue-regression.spec.cjs` pertencem ao projeto `independent`, com um
worker separado e saídas próprias; não amplie essa allowlist sem comprovar que
os specs não leem nem alteram SQL, sessão ou estado global compartilhado.

Para feedback curto durante a implementação, execute o subconjunto da camada
alterada (`composer test:unit`, `npm test` ou
`npm --prefix tests/browser run test:offline-queue`). O último comando seleciona
somente `offline-queue-regression.spec.cjs`, com IndexedDB real e respostas
controladas; seu setup sem SQL é fixo nesse atalho. Esses comandos focais não
substituem o perfil completo exigido para concluir uma mudança funcional.

Para executar somente qualidade, sem banco/servidor:

```powershell
powershell -ExecutionPolicy Bypass -File tools/test-local.ps1 -Suite quality
```

O perfil `all` inclui `composer verify`, build, `npm run check`, `npm test`,
`tests/run_all.php` dentro do ambiente Docker e testes de navegador. `composer
verify` reúne PHPUnit, lint PHP, PHPStan e verificação de estilo. O build Docker
compila os assets da revisão em teste numa camada cacheável. Os specs de
componentes os carregam pela URL pública da aplicação, portanto a imagem do
navegador só precisa das dependências Playwright. Alterações apenas de PHP/testes
reutilizam a camada de assets. O contrato visual é adicional: use
`-IncludeVisual` quando alterar aparência/layout. O executor também oferece os
perfis `integration`, `browser` e `visual`; browser e visual executam integração
antes do Playwright para preparar a base. O perfil browser inclui ranking
individual.

Os wrappers `test-local.ps1`, `test-docker.ps1` e `test-docker.sh` gravam
`run-manifest.json` com perfil, revisão, estado do checkout, seleção, duração
por etapa e código de saída. Playwright grava JSON além do relatório HTML e das
evidências de falha. A integração grava `integration-timings.json` com a duração
dos cenários em ordem decrescente. Um retry aprovado continua sendo reportado
como instável e falha no gate completo. Compare medições com o mesmo perfil,
separando primeira execução das repetições posteriores.

Alternativa descartável com Docker/Compose em execução:

```powershell
powershell -File tools/test-docker.ps1 -Database mariadb
```

No Linux/macOS: `sh tools/test-docker.sh --database mariadb`. Para MySQL, use
`-Database mysql`/`--database mysql`. Para visual, acrescente
`-IncludeVisual`/`--include-visual`. Todo perfil que envolve banco usa somente
o container descartável; não há backend SQL local suportado.

### Isolamento obrigatório

- Nunca rode resets ou seeds em uma base de trabalho/produção. Não desative `TestDatabaseSafety` nem a conferência da base pela saúde HTTP.
- Não execute `php tests/run_all.php`, `php tests/seed_interclasse_demo.php` ou `npm --prefix tests/browser test` isoladamente sem um container criado pelo executor descrito em [testes](docs/testing.md). O seed de demonstração não é uma etapa obrigatória após a suíte.
- Não configure testes para usar banco local. Preservar o lock, o projeto Compose e os nomes exclusivos das bases auxiliares evita colisões entre execuções.
- Não use a base de desenvolvimento em `8080` para os testes HTTP. O executor inicia seu próprio servidor e usa dados sintéticos.

### Escolher cobertura e registrar evidências

| Alteração | Cobertura relevante |
| --- | --- |
| Regras/casos de uso | `tests/Unit/`, com entradas válidas, inválidas e limites. |
| APIs, autorização ou edição | Integração HTTP: sucesso, acesso negado, CSRF, recurso de outra edição e persistência. |
| SQL, migração ou transação | Instalação, atualização, repetição, rollback de dados e recuperação; concorrência quando houver disputa/reenvio. |
| Placar, pontos ou chaveamento | Regras, contrato HTTP e fluxo completo no navegador; consistência entre eventos, resultado e avanço. |
| Fila/offline | Testes JavaScript e Playwright com IndexedDB real, reenvio, reconexão, erros de confirmação, IDs temporários e isolamento. |
| Página, modal ou navegação | Testes de ciclo de vida e navegador; contrato visual quando a aparência mudar. |

Consulte `tests/browser/offline-queue-regression.spec.cjs` para regressões da fila e os testes de arquitetura em `tests/Unit/Architecture/` para fronteiras entre camadas. Testes devem validar comportamento observável, sem depender de credenciais reais, dados pessoais, atrasos arbitrários ou IDs não preparados pelo cenário. Só atualize snapshots após inspecionar a mudança visual intencional; preserve referências por plataforma.

### Logs e investigação de falhas

- Toda execução de homologação deve produzir logs claros, consistentes e fáceis de correlacionar. Registre, quando aplicável, data/hora com fuso, nível, ambiente/versão, identificador de requisição ou execução, método e rota, status, duração, módulo/caso de uso, entidade envolvida, código da falha e contexto suficiente para reproduzir o problema.
- Separe logs de aplicação, acesso HTTP, testes e servidor quando possível; documente no resultado da execução onde cada log foi salvo, seu formato, como localizar uma execução específica e como correlacionar uma falha do navegador com a API e o servidor. Em caso de erro, registre também a operação tentada, o resultado esperado e o resultado observado, incluindo stack trace no log interno quando disponível.
- Não registre senhas, tokens, credenciais, dados pessoais desnecessários, SQL com valores sensíveis ou outros segredos. Logs precisam ser detalhados para diagnóstico sem criar risco de exposição; aplique rotação e retenção compatíveis com o ambiente.
- Ao entregar uma homologação ou relatar uma falha, informe a URL/ambiente, versão ou commit, comando e horário da execução, cenário reproduzido, resultado esperado, resultado observado e caminhos dos logs relevantes. Não declare funcionamento sem registrar também as limitações e os erros encontrados.

A matriz declarada em `.github/workflows/ci.yml` valida qualidade apenas em PHP 8.4. Integração, navegador e contrato visual usam PHP 8.4 e MariaDB 10.11; o contrato visual usa as referências Linux. PHP 8.2 e MySQL 8.4 continuam disponíveis nos executores locais, mas não fazem parte da validação do CI. O CI usa cache remoto BuildKit de camadas de imagem; ele acelera a preparação, não substitui comandos, relatórios ou resultados das suítes. Uma execução local não comprova a execução remota do CI.

Na entrega, informe o que mudou, quais comandos foram executados, seus resultados e limitações. Registre falhas preexistentes e pré-requisitos ausentes sem declarar aprovação. Revise `git diff --check` e o diff final, preserve alterações do usuário e atualize README/guias quando houver mudança de configuração, operação ou contrato.

## 8. Obrigação de prevenir regressões

Para toda implementação ou correção funcional, siga este ciclo:

1. **Antes de editar**, identifique os contratos afetados e execute os testes existentes relevantes para registrar a situação inicial. Em refatorações, execute a suíte completa antes e depois.
2. **Crie ou amplie testes automatizados junto com a mudança.** Uma funcionalidade nova precisa de cenários de sucesso, entradas inválidas e limites relevantes. Uma correção precisa de um teste que reproduza o defeito e falhe sem a correção, quando viável demonstrar isso sem desfazer alterações do usuário.
3. Cubra também os comportamentos existentes que compartilham o fluxo alterado. Quando aplicável, inclua permissões, isolamento de edição, persistência, rollback, duplicidade/reenvio e operação online/offline. Use a tabela da seção 7 para escolher as camadas.
4. Execute primeiro a regressão específica; depois, a suíte completa pelo perfil `all`. Inclua `-IncludeVisual` para alterações de aparência/layout e valide os motores SQL pertinentes quando alterar banco/migrações.
5. Inspecione as falhas e corrija as introduzidas pela mudança. Não remova testes, não use skips, não relaxe asserções nem atualize snapshots apenas para obter uma execução verde. Uma alteração intencional de contrato deve atualizar os testes com justificativa e manter cobertura do restante do comportamento.
6. Só declare a implementação validada depois de os testes exigidos passarem. Se houver impedimento de ambiente ou falha preexistente, descreva exatamente o que foi e não foi validado; não apresente uma execução parcial como suíte completa aprovada.

Testes novos devem verificar resultados observáveis e ser descobertos pelos executores existentes. Não deixe a regressão apenas em um script avulso ou em um teste manual. Build, lint e análise estática não substituem testes de comportamento; teste unitário não substitui integração HTTP/banco ou navegador quando essas fronteiras mudam. Evite testes que apenas repitam a implementação sem detectar uma quebra real.

A exceção para alterações exclusivamente documentais continua sendo a da seção 7. Não é necessário criar testes artificiais para texto, mas comandos e instruções devem ser conferidos contra os scripts reais.

## 9. Quando for solicitado subir o projeto para testes

Pedidos como “suba o projeto”, “rode localmente” ou “deixe disponível para eu testar” devem resultar em uma aplicação acessível e verificada, quando os pré-requisitos estiverem disponíveis. Execute o preparo necessário e informe a URL; não responda apenas com instruções. Use o contexto para distinguir exploração manual de execução da suíte automatizada.

### Aplicação local para exploração manual

1. Confira a pasta do projeto, PHP/extensões, Composer, Node, dependências, `.env`, banco e portas disponíveis. Preserve a configuração existente e os dados do usuário. Se já houver um servidor deste projeto, confira se atende à solicitação antes de iniciar outro.
2. Em instalação nova, siga o README: `composer install`, `npm ci --ignore-scripts`, `npm run build`, configuração de uma base local vazia e `php bin/sgi.php migrate`. Em instalação existente, verifique a necessidade e o impacto de migrações; não resete a base nem execute fixtures sobre dados de trabalho. Não reinstale dependências sem necessidade, mas regenere os assets se as fontes mudaram.
3. Confira `SGI_APP_URL=http://127.0.0.1:8080/` e `SGI_BASE_PATH` vazio para o exemplo na raiz. Se usar outra porta ou subdiretório, mantenha configuração e URL coerentes. Não sobrescreva `.env` com `.env.example` quando já existir.
4. Inicie o ambiente de desenvolvimento na raiz do projeto:

   ```powershell
   npm run dev
   ```

   O comando executa o build inicial, inicia o PHP em `127.0.0.1:8080` e mantém o live reload local. Ele observa `resources/`, `src/` e `config/`; não é necessário executar builds manuais durante a edição. O processo PHP pode ser informado por `SGI_DEV_PHP_PATH` e a porta por `SGI_DEV_PORT`.
5. Para deixá-lo disponível depois da resposta, mantenha o terminal do `npm run dev` aberto. Se usar `Start-Process` no Windows, use `-WindowStyle Hidden`, diretório de trabalho explícito e redirecione stdout/stderr para arquivos distintos em `test-results/`. Registre o PID e os caminhos dos logs. Não encerre outros processos para liberar uma porta; escolha outra porta livre.
6. Verifique por HTTP que a página de login responde e que CSS/JavaScript são servidos. Quando houver credenciais de teste disponíveis e o pedido incluir validação funcional, confira também login e a tela relevante; uma página de login carregada não comprova acesso ao banco ou funcionamento completo.
7. Entregue a URL clicável, o que foi verificado, como acessar com a conta local e como encerrar o processo criado. Não afirme que `admin`/`123` funciona na base normal. Se faltar o primeiro administrador, use o procedimento `admin:create` do README, sem redefinir contas existentes nem expor senhas nos logs.

Para exploração manual local, não publique o servidor na rede: use `127.0.0.1`. Isso não se aplica à homologação na rede local, que possui o procedimento abaixo. Não limpe IndexedDB nem filas pendentes para preparar o navegador. Se faltar um pré-requisito, informe qual é e o erro observado; não declare o servidor disponível sem verificar a resposta HTTP.

### Homologação acessível na rede local

Quando o pedido for de homologação ou de testes por mais de uma máquina, disponibilize a aplicação para os dispositivos da mesma rede local à qual a máquina está conectada, e não apenas em `127.0.0.1`. Configure o bind no IP da interface local apropriada ou em `0.0.0.0`, ajuste porta, firewall, hostname e `SGI_APP_URL` de forma coerente e verifique o acesso HTTP a partir de outro dispositivo da mesma rede antes de entregar a URL.

Restrinja o firewall à sub-rede local autorizada e nunca publique esse serviço na internet. Use base, uploads, sessões, credenciais e logs isolados para homologação; não exponha a base de trabalho/produção. Registre a interface, sub-rede, porta, URL, versão implantada, processo responsável, forma de encerramento e localização dos logs. A acessibilidade na rede local não dispensa autenticação, CSRF, autorização, isolamento de edição ou as demais proteções da aplicação.

### Executar testes automatizados e encerrar

Use o perfil `all` da seção 7. Esse executor prepara recursos isolados e encerra o servidor no final; não serve para deixar a aplicação aberta para exploração posterior. No executor local, `-Keep` preserva a base/container para investigação, mas o servidor HTTP ainda é encerrado no bloco de limpeza.

### Deixar uma base de demonstração isolada acessível

Quando o pedido exigir dados prontos para testar manualmente, use um projeto
Compose próprio e descartável. Não configure credenciais ou hosts de banco no
`.env` de trabalho e não use `tools/start-test-server.ps1` para apontar a uma
instância SQL local. Um exemplo mínimo, executado na raiz, é:

```powershell
$env:COMPOSE_PROJECT_NAME = 'sgi-demo-test'
$env:SGI_TEST_DB_NAME = 'sgi_test_demo'
$env:SGI_TEST_DB_RUNTIME = 'container'
docker compose -f compose.test.yml up -d --wait db app
docker compose -f compose.test.yml run --rm --no-deps integration
docker compose -f compose.test.yml run --rm --no-deps integration php tests/seed_interclasse_demo.php
```

O projeto publica o servidor em [http://127.0.0.1:8099/](http://127.0.0.1:8099/)
e mantém os dados somente enquanto o projeto estiver ativo. As contas dos
fixtures estão no README. Não acrescente o seed automaticamente após a suíte;
use-o somente quando o cenário manual exigir dados de demonstração. Ao terminar,
confirme a identidade do projeto e execute `docker compose -f compose.test.yml
down --volumes --remove-orphans`. A exploração manual não substitui o ciclo de
regressão automatizado da seção 8.

## 10. Commits e organização do stage

- Quando uma alteração estiver pronta para integração, faça commits atômicos e semânticos: cada commit deve representar uma única alteração coerente e completa, com mensagem clara e orientada à ação, usando o prefixo apropriado (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:` ou equivalente adotado pelo repositório). Não é obrigatório criar um commit imediatamente após cada alteração exclusivamente de estilo; agrupe apenas mudanças estilísticas relacionadas e não misture escopos diferentes.
- Nunca acumule alterações distintas no stage. Antes de cada commit, revise `git status`, `git diff` e `git diff --cached`, adicione somente os arquivos ou trechos pertencentes ao escopo do commit e separe mudanças não relacionadas em commits independentes.
- Preserve alterações existentes do usuário: não as inclua no stage nem as misture ao commit atual. Ao concluir uma implementação, deixe o histórico pronto para revisão, sem arquivos ou mudanças não relacionadas staged.
