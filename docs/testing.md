# Execução dos testes

## Execução descartável no Docker

O fluxo recomendado não exige PHP, Composer, Node, MySQL/MariaDB ou Chromium
instalados no host. O script constrói as imagens, cria um banco em `tmpfs`,
inicia o servidor HTTP, executa as suítes e remove os containers ao terminar.

No Windows:

```powershell
powershell -File tools/test-docker.ps1 -Database mariadb
```

No Linux/macOS:

```bash
sh tools/test-docker.sh --database mariadb
```

Para executar contra MySQL 8.4:

```powershell
powershell -File tools/test-docker.ps1 -Database mysql
```

O banco padrão é `sgi_test`, com usuário `root` e senha `sgi-test-only`.
Esses dados são exclusivos do ambiente de teste. `-Keep`/`--keep` mantém os
containers para investigação; sem essa opção o Compose executa `down --volumes`.

Quando o serviço `app` publica a porta HTTP no host, o bind padrão é
`127.0.0.1:8099`, evitando exposição acidental na rede. A porta pode ser alterada
com `SGI_TEST_HOST_PORT`. Para uma homologação que precise ser acessível por
outros dispositivos da rede local, configure explicitamente
`SGI_TEST_BIND_ADDRESS=0.0.0.0`, restrinja o firewall à sub-rede autorizada e
confirme a URL antes de compartilhar. O servidor dentro do container continua
escutando em `0.0.0.0:8099` somente para permitir o acesso entre os serviços
Compose pelo alias `sgi-web`; esse bind interno não publica a aplicação na rede
do host por si só.

As imagens usam PHP 8.4 por padrão. Para validar PHP 8.2:

```bash
sh tools/test-docker.sh --database mariadb --php-version 8.2
```

O comando executa, em sequência, validação do Composer e `composer verify`,
build das imagens com os assets da revisão, checks e testes JavaScript,
integração HTTP/banco (`tests/run_all.php`) e Playwright online/offline. Os dois
specs do navegador que validam componentes carregam os assets pela URL pública da
aplicação; somente a imagem PHP os compila. Alterações somente em PHP ou testes
reutilizam a camada de assets. Os resultados ficam em
`test-results/` e `tests/browser/{test-results,playwright-report}/`.

O contrato visual pode ser solicitado com `-IncludeVisual`/`--include-visual`.
O container usa referências Linux (`*-linux.png`) versionadas separadamente das
referências Windows (`*-win32.png`), evitando que a plataforma do executor
altere o resultado da comparação.

## Execução local em um comando

Para o desenvolvimento diário com runtimes instalados no host, use o executor
local. Ele escolhe um PHP único, cria um container SQL descartável com nome
exclusivo, inicia o servidor HTTP, prepara sessões e uploads em
`test-results/` e remove os processos/container criados ao terminar. Ele nunca
usa uma instância MySQL/MariaDB instalada no host.

Depois de instalar as dependências uma vez (`composer install`, `npm ci` e
`npm ci --prefix tests/browser`), execute:

```powershell
powershell -ExecutionPolicy Bypass -File tools/test-local.ps1 -Suite all
```

Os perfis disponíveis são `quality`, `integration`, `browser`, `visual` e
`all`. `quality` não inicia banco nem servidor. `browser` e `visual` executam a
integração antes do Playwright para preparar a mesma base descartável. `browser`
inclui todos os specs não visuais, inclusive ranking individual. A seleção de
backend local foi removida;
os executores recusam qualquer tentativa de apontar para um SQL externo. O
executor Docker cria um container temporário com `tmpfs`. O executor local
mantém PHP/Node/Chromium no host e exige apenas os clientes `mysql`/`mysqldump`
para o ensaio de recuperação; isso não significa que exista um banco local.
No Windows, os executáveis do XAMPP são encontrados automaticamente quando
existem. Use `-Keep` apenas para investigar uma falha; o ambiente mantido deve
ser removido manualmente depois.

Durante o desenvolvimento, rode o subconjunto ligado à mudança: `composer
test:unit` (PHPUnit), `npm test` (JavaScript) ou `npm --prefix tests/browser run
test:offline-queue` (IndexedDB real e respostas HTTP controladas, sem servidor
ou SQL). O atalho de fila seleciona somente `offline-queue-regression.spec.cjs`
e desativa explicitamente o setup SQL para essa seleção fixa. Estes comandos
focais não substituem a cobertura completa de integração e navegador na entrega.

O executor usa um lock por checkout porque alguns cenários de recuperação
criam bases auxiliares. Ele também passa um identificador de execução para que
essas bases não colidam entre invocações diferentes.

Para diagnosticar uma instalação, rode o perfil desejado: a validação falha
antes de criar recursos quando PHP, `mysqli`, clientes SQL, Docker, Node ou
dependências do navegador estão ausentes. Informe outro PHP com `-PhpPath` ou
`SGI_PHP_PATH`. O PHP escolhido é colocado primeiro no `PATH`, portanto
Composer, servidor e runner usam a mesma versão.

Para medir o custo de um perfil em execuções repetidas, use o benchmark. Ele
grava tempos, códigos de saída, primeira execução e repetições posteriores em
`test-results/`. Cada execução grava `run-manifest.json` com revisão, estado do
checkout, seleção, duração por etapa e código de saída. Playwright grava também
um relatório JSON estruturado junto ao HTML. O runner de integração grava
`integration-timings.json`, com a duração de cada classe de cenário em ordem
decrescente. A mediana calcula a média dos dois valores centrais quando há um
número par de aprovações:

```powershell
powershell -ExecutionPolicy Bypass -File tools/benchmark-tests.ps1 -Suite quality -Runs 3
```

O modo `auto` usa Compose/PHP 8.4 para perfis com banco e o host para `quality`;
assim, `all` inclui app, banco e navegador em containers descartáveis. Use
`-Runner host` para medir o PHP/navegador no host com banco descartável, ou
`-Runner compose -PhpVersion 8.2` para variar a versão de PHP no ambiente todo
em containers. Se uma execução falhar, as repetições continuam e cada código
de saída é salvo, mas só execuções completas aprovadas entram na mediana.
Compare a primeira execução e as repetições em condições equivalentes.

## Execução manual do runner de baixo nível

`tests/run_all.php` é um runner interno e não cria infraestrutura. Ele só pode
ser executado dentro de um serviço preparado pelos wrappers Docker. A chamada
direta sem esse ambiente falha antes de resetar o schema; não configure as
variáveis para fazê-la apontar a um banco local.

Para integração somente via Composer, use `composer test:integration`; esse
comando delega ao executor Docker e remove o ambiente ao terminar.

Não execute duas suítes que alteram o banco simultaneamente. Os cenários de integração montam uma edição compartilhada em sequência. Regressões concorrentes usam processos e conexões independentes: cobrem replay da mesma mutação, anulação contra conclusão do jogo e disputa de local/horário entre criação manual, edição e confirmação de bloco. As barreiras de teste sincronizam os participantes da corrida sem atrasos arbitrários.

## Navegador em execução manual

O fluxo recomendado é `tools/test-docker.ps1`/`.sh`, que já prepara o container
SQL, a aplicação e o navegador. Não execute Playwright diretamente contra uma
URL herdada ou um servidor conectado ao banco local.

No fluxo Docker, a imagem oficial do
Playwright já contém o Chromium e o serviço `browser` recebe
`SGI_BASE_URL=http://sgi-web:8099/`; não configure `SGI_E2E_RESET`, porque a etapa de
integração já prepara a mesma base descartável. Na execução manual,
`SGI_E2E_RESET=1` não substitui a preparação do container e o setup recusa
ambiente sem `SGI_TEST_DB_RUNTIME=container`. `SGI_CHROME_PATH` permite
outro executável, mas comparações visuais devem usar a mesma versão das
referências.

Os testes cobrem administração, portal do aluno, permissões, todas as telas principais e torneios com sete partidas. Os cenários offline desabilitam a rede do navegador, verificam IndexedDB e conferem no servidor o resultado após a reconexão.

`offline-queue-regression.spec.cjs` usa o IndexedDB real do Chromium e respostas HTTP controladas, sem alterar o banco SQL. Cobre a ordem entre alterações novas e pendentes, respostas sem confirmação de sucesso (vazias, HTML, JSON truncado ou `status: erro`), compatibilidade com `status: sucesso`, retry após falha de rede mantendo corpo e identidade da mutação, dependências de ocorrências nas rotas v1, jogos temporários intercalados, aborto de transação local, aplicação de resultados v1 no chaveamento, sondagem do servidor local, coordenação entre abas e exportação/importação idempotente sem credencial CSRF. `bootstrap-components.spec.cjs` também não usa SQL: monta o DOM no teste e carrega somente CSS/JavaScript estáticos. O Playwright mantém esses dois arquivos em um projeto de allowlist `independent`, com worker e diretório de saída próprios; todo o restante fica no projeto `database`, limitado a um worker. A execução completa inclui ambos os projetos, que podem rodar em paralelo sem compartilhar escrita no banco. O atalho `npm --prefix tests/browser run test:offline-queue` seleciona somente o teste da fila e não requer servidor ou SQL; a suíte completa ainda exige o container. Os testes JavaScript também verificam a captura dos cadastros e a projeção de placares pelas rotas v1.

O cenário de chaveamento ímpar prepara três equipes com elenco e exige um avanço automático inicial. Se a preparação falhar, a suíte falha. A retificação de placar usa os identificadores criados pelo próprio teste e consulta os valores persistidos depois da alteração.

`deployment-paths.spec.cjs` verifica redirecionamento, login, carregamento de arquivos e paridade das APIs no endereço configurado. Para testar uma instalação em subdiretório, inicie um servidor separado com `SGI_BASE_PATH=SGI` e execute esse teste com `SGI_BASE_URL=http://127.0.0.1:PORTA/SGI/`. O teste também roda normalmente na raiz. Os testes unitários usam sessões próprias em `test-results/unit-sessions/`, sem depender da pasta de sessões do servidor.

`legacy-offline-compat.spec.cjs` aparece em alguns relatórios e documentos históricos, mas não faz parte do inventário atual: foi removido durante a migração das rotas antigas para a API versionada. Não conte os cenários históricos de endpoint procedural ou casca antiga como execução da suíte atual. O fluxo offline suportado exige uma casca autenticada e preparada; refresh, nova aba e cold-open sem essa casca não são fluxos suportados porque o pacote não usa Service Worker.

`visual-contract.spec.cjs` compara quatro imagens do login em desktop/mobile. A resposta de credenciais inválidas é fixa nesse teste visual; a autenticação real é validada separadamente. O fluxo Docker compara as referências Linux; a execução host+Docker do `test-local.ps1` usa as referências Windows.

O gate Playwright falha se um caso passar somente após retry (`failOnFlakyTests`). Relatórios JSON, HTML, traces e screenshots mostram a duração e a tentativa com falha; uma tentativa posterior aprovada continua classificada como instável.

Imagens, traces e relatório ficam em `tests/browser/test-results/` e `tests/browser/playwright-report/`. Só atualize snapshots após inspecionar uma mudança visual intencional. Testes aprovados cobrem os cenários descritos; não representam garantia de ausência de qualquer defeito.

## Matriz e recuperação

O CI executa qualidade apenas em PHP 8.4. Integração HTTP/banco,
navegador e contrato visual usam PHP 8.4 e MariaDB 10.11; o visual usa as
referências Linux. A configuração está em `.github/workflows/ci.yml`. A matriz
do CI usa uma única versão de PHP e MariaDB; MySQL e PHP 8.2 continuam disponíveis
para execuções locais pelo executor Docker. Buildx usa cache remoto de camadas
separado para as imagens da aplicação e do navegador. Apenas o job de integração
exporta esses caches; qualidade e visual apenas importam, evitando gravações
concorrentes. Falha de exportação não interrompe os testes. O cache não contém
resultado de teste, banco mutado ou sessão de usuário, portanto cada job continua
executando seus comandos e reunindo seus próprios relatórios.

`composer test:integration` executa `MigrationsTest`, que confirma a instalação
repetida e os elementos estruturais esperados no baseline atual, além de
`MigrationSupportTest` e `RecoveryRehearsalTest` para verificar migrations
futuras e a reinstalação do baseline. As bases de teste são descartáveis e os
ensaios não apontam para uma base de trabalho nem limpam filas IndexedDB. O
container, projeto Compose e volumes são removidos ao final da execução normal.

O perfil Docker completo reaplica `php bin/sgi.php migrate` depois da integração
geral e antes do Playwright. Isso restaura o schema atual após os cenários que
testam instalação incompleta, sem apagar os dados compartilhados do restante da
suíte. Ao final, o runner recria uma base isolada para
`FullInterclasseSimulationTest` e executa `full-interclasse-portal.spec.cjs` no
projeto serial `simulation`. A spec autentica os 224 alunos sintéticos e confere
suas inscrições; partidas e provas são exercitadas por HTTP nessa simulação. Os
testes genéricos de placar/offline no projeto `database` usam fixtures próprias
e não contam como S08 integrado da mesma edição.
