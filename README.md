# SGI — Sistema de Gestão de Interclasses

Aplicação web para organizar os Interclasses do SESI: edições anuais, turmas, alunos, modalidades, equipes, jogos, chaveamento, ranking, arrecadações e ocorrências disciplinares.

Este guia é o ponto de partida para quem vai estudar e continuar o projeto. Primeiro coloque a aplicação para funcionar localmente; depois use a seção de testes para validar suas alterações.

## Tecnologias e perfis de acesso

O SGI é um monólito modular em **PHP 8.2+ e MySQL/MariaDB**, com HTML, CSS e JavaScript sem framework de frontend. Usa Bootstrap, Axios e Smalot/PdfParser. O mesário usa IndexedDB para armazenar dados e operações offline no navegador.

| Nível | Perfil | Uso principal |
| --- | --- | --- |
| 0 | Administrador | Configurar edições, usuários e regras; acesso completo. |
| 1 | Colaborador | Gerenciar jogos, pontuações e ocorrências. |
| 2 | Mesário | Operar partidas da edição ativa, inclusive offline após o preparo. |
| 3 | Aluno | Aceitar termos, consultar jogos e se inscrever em até três modalidades. |

## Instalação local, passo a passo

Os exemplos abaixo usam **Windows e PowerShell**, executados na pasta do projeto. Nos comandos comuns (`php`, `composer` e `npm`), o fluxo também serve para Linux/macOS; as diferenças de configuração do ambiente estão indicadas.

### 1. Preparar as ferramentas e abrir a pasta

Instale ou disponibilize:

- **PHP 8.2 ou superior**, com `mysqli`, `mbstring` e `fileinfo`. Para as ferramentas e os testes, habilite também DOM/XML, XMLWriter e cURL. O CI executa os testes em PHP 8.4.
- **Composer 2**, para as dependências PHP.
- **Node.js 22 e npm**, para gerar os arquivos usados pelo navegador e executar o watcher de desenvolvimento.
- **MySQL ou MariaDB** em execução. O CI testa com MariaDB 10.11; MySQL continua disponível como opção nos executores locais.
- **Git**, se for obter o projeto por clone. Também é possível extrair o pacote recebido.

Abra a pasta que contém `composer.json`, `package.json` e `README.md` no editor e abra um terminal nessa pasta. Confira:

```powershell
php -v
php --ini
php -m
composer --version
node --version
npm --version
```

Se usar XAMPP, inicie o serviço **MySQL** pelo painel. Para este guia, o próprio PHP servirá a aplicação; não é necessário iniciar o Apache nem colocar o projeto em `htdocs`. Se o PHP do XAMPP não estiver no PATH, ajuste nesta sessão do PowerShell:

```powershell
$env:Path = 'C:\xampp\php;C:\xampp\mysql\bin;' + $env:Path
```

Adapte os caminhos à sua instalação. Use `php --ini` para descobrir qual `php.ini` o terminal realmente utiliza.

### 2. Instalar dependências e gerar os assets

```powershell
composer install
npm ci --ignore-scripts
npm run build
```

Isso prepara `vendor/`, `node_modules/` e `public/assets/`. A instalação das dependências precisa de acesso à internet. Aguarde cada comando terminar com sucesso antes de continuar.

### 3. Criar o banco e configurar o ambiente

Crie uma **base vazia de desenvolvimento**, por exemplo `sgi`, usando o phpMyAdmin (aba SQL) ou o cliente MySQL/MariaDB:

```sql
CREATE DATABASE sgi CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Copie o arquivo de configuração apenas na primeira instalação; preserve seu `.env` se ele já existir:

```powershell
Copy-Item .env.example .env
```

No Linux/macOS, use `cp .env.example .env`. Edite estas linhas no `.env` para combinar com o servidor e o banco locais:

```dotenv
SGI_APP_ENV=development
SGI_APP_DEBUG=0
SGI_APP_URL=http://127.0.0.1:8080/
SGI_BASE_PATH=

SGI_DB_HOST=127.0.0.1
SGI_DB_PORT=3306
SGI_DB_NAME=sgi
SGI_DB_USER=root
SGI_DB_PASSWORD=
```

O exemplo de `root` sem senha só funciona se o seu banco local estiver configurado assim. Informe seu usuário e senha reais quando necessário. O usuário precisa poder criar e alterar tabelas para instalar o schema inicial. Mantenha as demais opções de diretórios do arquivo de exemplo.

Não envie `.env` para o Git. Variáveis `SGI_*` definidas no terminal têm prioridade sobre o arquivo; ao trocar de ambiente, confira se não ficaram valores de outra execução.

Crie as tabelas pelo schema inicial atual:

```powershell
php bin/sgi.php schema:install
```

O comando deve terminar com **Schema inicial instalado.** Não é necessário importar outro dump SQL. O comando `php bin/sgi.php migrate` também continua disponível: instala o baseline quando necessário e aplica as migrations futuras existentes em `database/migrations/`.

O schema inicial já contém o estado da troca obrigatória de senha. Em um banco local de desenvolvimento com alunos importados anteriormente, para definir a senha inicial compartilhada `sesi-senai` e revogar sessões anteriores, execute:

```powershell
php bin/sgi.php students:senha-inicial --confirm-database=sgi
```

Troque `sgi` pelo valor exato de `SGI_DB_NAME`. O comando exige `SGI_APP_ENV=development`, substitui as senhas dos alunos pela senha inicial compartilhada e pode ser repetido sem alterar alunos já inicializados. Instalações novas sem alunos existentes não precisam executá-lo. Alunos criados por cadastro ou importação e senhas redefinidas pela administração já usam essa senha inicial e precisam trocá-la no primeiro acesso.

### 4. Criar o primeiro administrador

O schema não cria usuários de demonstração. No PowerShell, escolha seu login, nome e uma senha de pelo menos 12 caracteres:

```powershell
$env:SGI_ADMIN_LOGIN = Read-Host 'Login do administrador'
$env:SGI_ADMIN_NAME = Read-Host 'Nome do administrador'
$senhaAdmin = Read-Host 'Senha (mínimo de 12 caracteres)' -AsSecureString
$env:SGI_ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $senhaAdmin).Password
php bin/sgi.php admin:create
Remove-Item Env:SGI_ADMIN_LOGIN, Env:SGI_ADMIN_NAME, Env:SGI_ADMIN_PASSWORD
Remove-Variable senhaAdmin
```

No Linux/macOS, uma alternativa é adicionar temporariamente `SGI_ADMIN_LOGIN`, `SGI_ADMIN_NAME` e `SGI_ADMIN_PASSWORD` ao `.env`, executar `php bin/sgi.php admin:create` e remover essas três linhas em seguida.

O resultado esperado é **Administrador inicial criado: ...**. O comando recusa criar outro administrador se já existir um; ele não redefine senhas. Guarde as credenciais escolhidas para entrar no sistema.

### 5. Iniciar o desenvolvimento com live reload

Na raiz do projeto, execute:

```powershell
npm run dev
```

Esse comando faz o build inicial dos assets, inicia o servidor PHP em [http://127.0.0.1:8080/](http://127.0.0.1:8080/) e observa `resources/`, `src/` e `config/`. Alterações em CSS, SCSS, JavaScript ou imagens recompilam os assets automaticamente; alterações em PHP recarregam o navegador automaticamente. O recurso é ativado somente quando `SGI_APP_ENV=development` está configurado.

Mantenha esse terminal aberto e entre com o administrador criado no passo anterior. Para encerrar o watcher e o servidor PHP, pressione **Ctrl+C**.

Se o PHP não estiver no `PATH`, informe o executável nesta sessão do PowerShell:

```powershell
$env:SGI_DEV_PHP_PATH = 'C:\xampp\php\php.exe'
npm run dev
```

Para usar outra porta, defina `SGI_DEV_PORT` e mantenha `SGI_APP_URL` coerente:

```powershell
$env:SGI_DEV_PORT = '8081'
$env:SGI_APP_URL = 'http://127.0.0.1:8081/'
npm run dev
```

O servidor embutido é destinado ao desenvolvimento local; não é necessário iniciar o Apache nem colocar o projeto em `htdocs`. Para apenas gerar os assets sem iniciar o ambiente, use `npm run build`.

O diretório público do servidor deve ser sempre **`public/`**. Não abra os arquivos PHP diretamente no navegador. Publicação com Apache ou outro servidor está descrita em [implantação e recuperação](docs/deployment.md).

### 6. Preparar dados para explorar o sistema

Uma instalação nova não contém o evento de demonstração da suíte de testes. Pelo painel administrativo:

1. Crie uma edição do Interclasses e deixe a edição desejada ativa.
2. Confira as categorias, turmas, modalidades e equipes geradas e ajuste os cadastros.
3. Nas edições novas, informe em cada modalidade a quantidade de equipes/entradas por turma e os limites do elenco; prepare as equipes vazias antes de cadastrar os alunos.
4. Na Agenda, prepare as equipes vazias, gere a grade e publique o cronograma antes das inscrições. Se precisar corrigir os horários antes de liberar a competição, encerre as inscrições, reabra a revisão e gere/publique uma nova grade; a revisão substitui os compromissos da publicação suspensa e preserva as reservas independentes. Depois da liberação, a árvore não pode ser substituída. Os alunos podem consultar os confrontos previstos e escolher as modalidades com essa informação; o servidor recusa conflitos de horário entre modalidades, inclusive nas fases condicionais.
5. Cadastre ou importe alunos e acompanhe as inscrições nas equipes exatas da turma. Ao final da janela, encerre as inscrições, resolva os elencos incompletos e use **Liberar competição**; essa ação cria os jogos iniciais com base na árvore e nos horários publicados.
6. Cadastre um usuário mesário. Depois da liberação, ele poderá operar as partidas disponíveis pelo placar; resultados avançam os próximos confrontos mantendo a agenda publicada.
7. Faça login com cada perfil para conferir suas telas e permissões.

Use dados fictícios nas atividades de desenvolvimento. Para cenários automatizados já preparados, siga a próxima seção; os fixtures de testes não devem ser carregados sobre sua base de trabalho.

A tela Chaveamento acompanha a árvore publicada e seus resultados. Ela não gera uma chave separada: prepare, publique, abra/encerre inscrições e libere a competição pelo fluxo da Agenda.

### Homologação zerada na rede local

Para disponibilizar uma instalação limpa para outros dispositivos da mesma rede, use o Compose dedicado abaixo. Ele cria um MariaDB e volumes persistentes exclusivos; não usa `.env`, banco, uploads ou sessões do ambiente de desenvolvimento. Não use `down --volumes` enquanto quiser preservar os dados da homologação.

Crie `.env.homologacao` na raiz (o arquivo é ignorado pelo Git) com credenciais próprias e o IPv4 da interface de rede autorizada:

```dotenv
COMPOSE_PROJECT_NAME=sgi-homologacao-limpa
SGI_HML_BIND_ADDRESS=10.141.117.3
SGI_HML_HOST_PORT=8100
SGI_HML_APP_URL=http://10.141.117.3:8100/
SGI_HML_DB_PASSWORD=troque-por-uma-senha-forte-do-banco
SGI_HML_ADMIN_LOGIN=admin-homologacao
SGI_HML_ADMIN_NAME=Administrador Homologação
SGI_HML_ADMIN_PASSWORD=troque-por-uma-senha-forte-do-administrador
```

Troque os dois segredos antes de iniciar e compartilhe a senha do administrador somente com quem fará os testes. A senha fica no arquivo local `.env.homologacao`, não nos logs. Suba e confira a instalação:

```powershell
docker compose --env-file .env.homologacao -f compose.homologacao.yml up -d --build --wait
docker compose --env-file .env.homologacao -f compose.homologacao.yml ps
Invoke-WebRequest http://10.141.117.3:8100/api/v1/health
```

Acesse `http://10.141.117.3:8100/` a partir dos dispositivos na mesma rede. Se o Windows Defender Firewall bloquear a conexão, crie uma regra de entrada TCP somente para a sub-rede local autorizada (neste exemplo, `10.141.117.0/25`); não exponha a porta à internet. O servidor containerizado atende na porta `8100` do host. Logs: `docker compose --env-file .env.homologacao -f compose.homologacao.yml logs --tail 200 app db`.

Para parar e preservar os dados: `docker compose --env-file .env.homologacao -f compose.homologacao.yml stop`. Para reiniciar: `... start`. A remoção dos containers sem apagar volumes é `... down`; para uma nova homologação realmente zerada, apague deliberadamente os volumes exclusivos com `... down --volumes` e então execute `up` novamente. Confira o nome do projeto antes de remover volumes.

## Testes automatizados

**Explorar a aplicação em `8080` e executar a suíte automatizada são fluxos diferentes.** Os testes de integração recriam dados e precisam de banco e servidor isolados. Os executores abaixo preparam esse ambiente; não aponte testes para uma base que deseja preservar.

### Testes com banco em container descartável

Depois da instalação acima, prepare também o navegador de testes:

```powershell
npm ci --prefix tests/browser
npx --prefix tests/browser playwright install chromium
```

Para executar a suíte completa, incluindo qualidade PHP, build, verificações
JavaScript, integração HTTP/banco e navegador, use o Docker Compose. O serviço
SQL é criado exclusivamente para a execução, usa armazenamento temporário e é
removido ao final:

```powershell
powershell -File tools/test-docker.ps1 -Database mariadb
```

Para validar MySQL 8.4, use `-Database mysql`. Para incluir o contrato visual,
acrescente `-IncludeVisual`. Não configure `SGI_TEST_DB_HOST`,
`SGI_TEST_DB_PORT`, `SGI_TEST_DB_USER` ou `SGI_TEST_DB_PASSWORD` para os testes;
o executor fornece a configuração do container e não reutiliza o `.env` da
aplicação.

Quando PHP, Node e Chromium já estiverem instalados no host, `test-local.ps1`
continua disponível como atalho, mas os perfis que acessam o banco também
criam um container Docker e nunca usam um servidor SQL local:

```powershell
powershell -ExecutionPolicy Bypass -File tools/test-local.ps1 -Suite all
```

Para uma verificação de qualidade sem banco nem servidor:

```powershell
powershell -ExecutionPolicy Bypass -File tools/test-local.ps1 -Suite quality
```

Durante o desenvolvimento, rode o subconjunto ligado à mudança:
`composer test:unit` para regras PHP, `npm test` para JavaScript ou
`npm --prefix tests/browser run test:offline-queue` para a regressão IndexedDB
sem servidor nem banco SQL. Essas execuções dão feedback focalizado e não
substituem o perfil completo ao concluir uma mudança funcional.

Esse perfil executa `composer verify`, `npm run build`, `npm run check` e `npm test`. Ele não substitui integração e navegador. Antes e depois de refatorações, execute a suíte completa. Acrescente `-IncludeVisual` para as comparações de imagem.

### Execução sem banco

Para executar somente qualidade PHP/JavaScript, sem banco nem servidor:

```powershell
powershell -ExecutionPolicy Bypass -File tools/test-local.ps1 -Suite quality
```

Esse perfil executa `composer verify`, `npm run build`, `npm run check` e `npm
test`. Ele não substitui a integração e o navegador, que exigem Docker.

No Linux/macOS, o fluxo completo equivalente é:

```bash
sh tools/test-docker.sh --database mariadb
```

Use `-Database mysql` (ou `--database mysql`) para MySQL 8.4.
`-IncludeVisual`/`--include-visual` inclui o contrato visual. Sem
`-Keep`/`--keep`, os containers são removidos ao final. Quando a porta HTTP do
Compose for publicada no host, o padrão é o loopback `127.0.0.1`; use
`SGI_TEST_BIND_ADDRESS=0.0.0.0` somente quando a homologação precisar de acesso
explícito pela rede local. Esse fluxo valida o projeto; não é o servidor de
desenvolvimento do passo 5.

Os executores `test-local.ps1` e `test-docker.ps1` gravam um manifesto
`run-manifest.json` em `test-results/` com revisão, perfil, seleção, etapas,
durações e código de saída. O runner de integração registra também a duração
de cada cenário em `integration-timings.json`. Playwright grava resultados JSON
junto aos relatórios HTML, traces e screenshots. Consulte [o guia de
testes](docs/testing.md) para perfis e diagnóstico.

### Contas exclusivas dos fixtures de teste

Estas contas são preparadas pela suíte na **base isolada**, não pelo comando `migrate` da instalação local:

| Perfil | Login | Senha |
| --- | --- | --- |
| Administrador | `admin` | `123` |
| Colaborador | `colab` | `123` |
| Mesário | `mesario` | `123` |
| Aluno de teste | `2879` | `123` |

## Testar o modo offline manualmente

1. Com a aplicação local funcionando e uma edição ativa com jogos, entre com o **mesário que você cadastrou**, em [http://127.0.0.1:8080/](http://127.0.0.1:8080/).
2. Aguarde a mensagem **Pronto para uso offline! 🟢**. O login e o preparo inicial precisam de conexão com o servidor.
3. Na mesma aba, abra as ferramentas do navegador (**F12**), vá a **Network/Rede** e selecione **Offline**. Isso simula a perda de acesso ao servidor local; desligar apenas o Wi-Fi não interrompe o endereço `127.0.0.1`.
4. Opere o placar e navegue pela aplicação na aba já preparada. Experimente gols, ocorrências e conclusão de partidas de mata-mata.
5. Desative **Offline** (selecione **No throttling/Sem limitação**) e aguarde a sincronização. Confira os resultados persistidos após a reconexão. Operações recusadas permanecem na fila para revisão.

O modo offline usa uma casca de navegação previamente carregada e não utiliza Service Worker. Recarregar a página, fechar a aba ou abrir outra aba sem conexão não faz parte do fluxo suportado. Não limpe os dados do site/IndexedDB enquanto houver operações pendentes. Use sempre o mesmo endereço: `localhost` e `127.0.0.1`, assim como portas diferentes, têm armazenamentos separados no navegador.

## Entender o código e continuar o desenvolvimento

```text
SGI/
├── public/                 # Entrada HTTP e assets gerados; raiz do servidor web
├── bootstrap/              # Inicialização, autoload e composição da aplicação
├── config/                 # Configuração e rotas
├── src/Modules/            # Regras e funcionalidades por módulo
├── src/Shared/             # HTTP, banco, transações e armazenamento compartilhados
├── resources/views/        # Templates PHP das páginas e componentes
├── resources/js/           # Scripts das páginas e subsistema offline
├── resources/css/          # Fontes dos estilos
├── resources/images/       # Imagens e ícones
├── bin/sgi.php             # Instalação do schema e administrador inicial
├── database/schema-inicial.sql # Estado atual para bases novas
├── database/migrations/    # Migrations futuras após a entrada em produção
├── database/seeders/       # Fixtures exclusivos de testes
├── storage/                # Sessões, uploads e arquivos de execução
├── tests/                  # Testes PHP, HTTP, JavaScript e navegador
├── tools/                  # Build, verificações e executores de testes
└── docs/                   # Guias detalhados
```

Uma requisição entra por `public/index.php`, carrega `bootstrap/app.php` e segue para a rota e o controlador responsáveis. Os módulos são `Acesso`, `Eventos`, `Participantes`, `Competicoes`, `Resultados`, `Disciplina` e `Sincronizacao`. Dentro deles, `Domain` concentra contratos/regras, `Application` os casos de uso, `Infrastructure` a persistência e `Presentation/Http` os controladores.

Ao alterar o projeto:

- Durante o desenvolvimento, execute **`npm run dev`**: ele inicia o servidor PHP, recompila os assets alterados e recarrega o navegador. O comando **`npm run build`** continua sendo usado para um build isolado, CI e preparação de implantação.
- Edite JavaScript, CSS, SCSS e imagens em `resources/`; não altere `public/assets/` manualmente, pois esse diretório é gerado pelo build.
- Crie APIs em `/api/v1` e templates em `resources/views/`. Use `SGI_ROOT` para includes e os utilitários `Assets`/`Url` para links.
- Para alterar o banco depois da entrada em produção, atualize `database/schema-inicial.sql` para novas instalações e crie uma migration numerada em `database/migrations/` para bases já instaladas. Valide instalação, aplicação e repetição.
- Preserve os identificadores das mutações e o schema offline enquanto houver operações pendentes no cliente.
- Execute as verificações e revise `git diff` antes de entregar alterações. Não versione senhas, uploads ou dados pessoais.

Leia [AGENTS.md](AGENTS.md) para as convenções, [arquitetura](docs/architecture.md) para o fluxo entre camadas, [testes](docs/testing.md) para validar alterações e [implantação e recuperação](docs/deployment.md) para atualizar instalações existentes.

## Problemas comuns na primeira execução

| Sintoma | O que conferir |
| --- | --- |
| `php`, `composer`, `node` ou `npm` não é reconhecido | Instalação e PATH; reabra o terminal após instalar as ferramentas. |
| PowerShell bloqueia `npm.ps1` | Use `npm.cmd` no lugar de `npm` e `npx.cmd` no lugar de `npx`. |
| Composer informa extensão PHP ausente | Veja `php --ini` e `php -m`, habilite a extensão no PHP usado pelo terminal e repita `composer install`. |
| `vendor/autoload.php` não encontrado | Execute `composer install` na raiz do projeto. |
| Conexão recusada ou `Access denied` no banco de teste | Docker Engine em execução e `tools/test-docker.ps1`/`.sh`; não aponte o teste para o `.env` local. |
| Banco desconhecido ou tabela inexistente nos testes | Execute o wrapper Docker completo; ele cria a base, instala o schema e carrega os fixtures antes da suíte. |
| Login `admin` / `123` não funciona | Essas credenciais são dos testes. Na base local, use o administrador criado por `admin:create`. |
| Página sem estilos ou scripts | Execute `npm ci --ignore-scripts` e `npm run build`; confirme que o servidor aponta para `public/`. |
| `npm run dev` não recarrega o navegador | Confirme `SGI_APP_ENV=development`, que `npm run dev` continua aberto e que a porta `35729` está livre. |
| Endereço errado ou erro 404 | Execute `npm run dev`, use o endereço `http://127.0.0.1:8080/` e mantenha `SGI_BASE_PATH` vazio para a instalação na raiz. |
| Porta 8080 ocupada | Defina `SGI_DEV_PORT`, atualize `SGI_APP_URL` e use o mesmo endereço no navegador. |
| Erro ao gravar sessão ou upload | Confira permissão de escrita nos diretórios `storage/` configurados no `.env`. |
| Teste de navegador não encontra Chromium | Execute `npx --prefix tests/browser playwright install chromium`. |

Depois de mudar `.env` ou `php.ini`, reinicie o servidor local. Para investigar erros durante o desenvolvimento, consulte a saída do terminal do servidor e habilite temporariamente `SGI_APP_DEBUG=1` no ambiente local.

## Licença e direitos

Desenvolvido para uso educacional e institucional no **SESI**. Todos os direitos reservados.
