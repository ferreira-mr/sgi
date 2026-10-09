# Instalação e recuperação

## Artefato da aplicação

Instale as dependências com `composer install --no-dev --optimize-autoloader` e execute `npm ci --ignore-scripts` seguido de `npm run build` durante a preparação do pacote. O servidor precisa de `vendor/`, `public/assets/`, `bootstrap/`, `config/`, `src/` e `resources/views/`. Node.js não é necessário para atender requisições.

`public/assets/` é gerado e não é versionado. Edite as fontes em `resources/`. O build inclui versões fixadas das bibliotecas e suas licenças. `public/index.php` é a única entrada HTTP; não publique a raiz do repositório.

Para uploads, o PHP precisa de um `upload_tmp_dir` existente e gravável pelo usuário do servidor. Mantenha `display_errors=0` e `log_errors=1` fora do desenvolvimento; avisos emitidos durante o upload podem ser adicionados ao corpo da resposta e invalidar o JSON da API. O `docker-test-entrypoint` cria o `upload_tmp_dir` informado no comando do PHP e os diretórios definidos por `SGI_SESSION_DIR`, `SGI_UPLOAD_DIR`, `SGI_REGULAMENTOS_DIR`, `SGI_FOTOS_DIR` e `SGI_IMPORT_DIR` antes de iniciar o processo. O diretório persistente de regulamentos continua sendo configurado por `SGI_REGULAMENTOS_DIR`.

## Banco

Crie um banco vazio e configure `SGI_DB_*`. Execute `php bin/sgi.php schema:install`. O comando aplica `database/schema-inicial.sql`; `php bin/sgi.php migrate` também instala o baseline quando necessário e aplica migrations futuras. Uma base parcial ou sem o marcador do baseline, com tabelas inesperadas, é recusada para evitar instalação sobre dados não previstos; bases já marcadas continuam aceitando tabelas criadas por migrations futuras.

Para habilitar o cronograma antes das inscrições, execute `php bin/sgi.php migrate`
 após o backup e confirme a aplicação de `001_cronograma_inscricoes.sql` e
 `002_cronograma_nos.sql`. No
painel, informe a quantidade de equipes/entradas por turma em cada modalidade,
prepare as equipes vazias, gere e revise a grade e publique-a antes de abrir as
inscrições. Para alterar uma agenda publicada, use a revisão: ela fecha as
inscrições, preserva a versão suspensa e exige nova publicação. Em uma instalação
deste produto a migration deve estar aplicada antes do primeiro uso.

Para a primeira conta, informe `SGI_ADMIN_LOGIN`, `SGI_ADMIN_NAME` e `SGI_ADMIN_PASSWORD` somente no ambiente do comando `php bin/sgi.php admin:create`. A senha precisa ter pelo menos 12 caracteres e é persistida com `password_hash`. A rotina não substitui administradores existentes.

Os dados de demonstração em `database/seeders/test.sql` pertencem aos testes. Não os carregue em produção.

## Alterações futuras do schema

O baseline cobre as instalações novas deste pacote. Depois da entrada em
produção, atualize `database/schema-inicial.sql` para instalações novas e crie
uma migration numerada em `database/migrations/` para bases já instaladas.
Execute `php bin/sgi.php migrate` em uma janela controlada, após backup e
validação em ambiente separado.

## Operação offline atual

O cliente atual usa a casca SPA preparada durante a sessão e armazena HTML, configuração e JavaScript da página juntos. A operação offline exige que a casca e os dados tenham sido preparados antes da perda de conexão; não há suporte declarado para abertura fria ou refresh sem essa preparação. O navegador não usa Service Worker.

O identificador de mutação acompanha os reenvios. As confirmações registram a identidade do operador e o conteúdo da operação; a mesma chave com conteúdo ou operador diferente é recusada. Gols, ocorrências e resultados protegidos são confirmados junto com o registro de repetição na mesma transação. Operações recusadas permanecem na fila e precisam de revisão.

## Recuperação

Se a instalação falhar, interrompa novas escritas e guarde os logs. Como o
instalador não faz rollback destrutivo de DDL, descarte a base incompleta e
recrie uma base vazia somente depois de confirmar o motivo da falha.

Para uma base em uso, faça backup consistente do banco, dos uploads, das
importações e da configuração. Teste a restauração em uma base separada antes
de redirecionar a aplicação.

Preserve as filas IndexedDB durante a recuperação. Não limpe dados do navegador de um mesário com alterações ainda não confirmadas.

Os testes de integração recriam somente bases descartáveis e verificam o
baseline e o suporte a migrations futuras por meio de
`tests/Integration/MigrationsTest.php`,
`tests/Integration/MigrationSupportTest.php` e
`tests/Integration/RecoveryRehearsalTest.php`. Eles não alteram uma base de
trabalho nem removem filas IndexedDB.
