# Auditoria e plano de ajustes do cronograma de inscrições

Referência: `c88a5b0d3db995563ca996c46d7c0298248de057`, incluindo a implementação anterior `f2459de5`. Inspeção realizada em 22/09/2026, America/Sao_Paulo. Árvore de trabalho inicialmente limpa. Esta entrega é uma revisão e um plano; não altera o comportamento da aplicação.

**Parecer: a implementação não deve ser considerada funcionalmente concluída.** A suíte existente oferece proteção útil, mas não demonstra os contratos centrais da funcionalidade. Há defeitos identificáveis no código mesmo com os testes unitários aprovados. Aprovação da suíte não equivale a cobertura do regulamento nem a garantia absoluta de ausência de defeitos.

**Roteiro para execução posterior por Luna:** [plano de correções de 22/09/2026](plano-correcao-cronograma-luna-2026-09-22/README.md), com contratos finais, etapas C00–C12, matriz de regressão, STATUS e prompt de retomada. A criação do roteiro não implementa nem valida as correções desta auditoria.

## 1. Evidências e limitações

Foram conferidos serviço, regras, planejador, repositórios, controlador, composição das rotas, interface da agenda, migrações, fluxo de inscrição e testes específicos. As regras de referência estão em [01-regras-e-fluxos.md](plano-cronograma-inscricoes-luna-2026-09-21/01-regras-e-fluxos.md) e [02-contratos-e-arquitetura.md](plano-cronograma-inscricoes-luna-2026-09-21/02-contratos-e-arquitetura.md).

Os achados abaixo distinguem reprodução sem banco de conclusão por inspeção. Não foram feitos resets, seeds ou alterações na base de trabalho. As verificações com banco usam exclusivamente o executor oficial e containers descartáveis. Os registros históricos de aprovação em STATUS.md não foram tratados como prova de uma nova execução nem de cobertura de cenários ausentes.

### Premissa de implementação: sem compatibilidade com versões anteriores

Conforme orientação do usuário em 22/09/2026, o sistema está em desenvolvimento e a correção deve adotar um único contrato atual. É permitido substituir estruturas, identidades, payloads e formatos de armazenamento, atualizando servidor, frontend, offline, fixtures e testes em conjunto. Não criar aliases antigos, adaptadores, leitura dupla, fallback legado, conversores de publicações ou migração de filas entre versões do software. Remover os caminhos substituídos e testar a instalação limpa com o modelo final. A atualização de instalações antigas não é requisito deste plano.

A versão do cronograma continua necessária: identifica revisões do mesmo evento durante a operação, impedindo inscrições e publicações sobre dados obsoletos; não significa suportar versões antigas do software. Permanecem a atomicidade, a idempotência e a preservação de inscrições, resultados e filas produzidos pela versão atual durante o uso normal. Bases e caches antigos de desenvolvimento podem ser recriados no ambiente descartável de teste. Esta auditoria não redefine nem apaga a base de trabalho do usuário.

## 2. Achados prioritários

### A01 — P1: chaveamento é montado dentro de cada turma, não entre as turmas da categoria

Em `MysqliCronogramaRepository::generateDraft`, a consulta das equipes e a chamada a `CronogramaBracketPlanner::plan` ficam dentro do laço de turmas. Não há etapa que reúna seus representantes em uma disputa da modalidade/categoria. Com uma equipe em cada uma de três turmas, o resultado são três BYEs e nenhum confronto; com várias equipes por turma, ocorrem torneios separados dentro de cada turma. Isso não entrega o exemplo interclasses do plano.

Evidência: trecho de geração em `src/Modules/Competicoes/Infrastructure/MysqliCronogramaRepository.php:175` e planejador em `src/Modules/Competicoes/Domain/CronogramaBracketPlanner.php:18`. A chamada com uma entrada foi reproduzida sem banco e retornou apenas um BYE. O teste de integração desativa todas as turmas, exceto uma, e portanto não identifica o defeito.

**Ajuste:** definir o conjunto de participantes por modalidade/categoria, mantendo a turma como origem da equipe. Formar a árvore completa desse conjunto. Separar formato de participação de formato de competição: atualmente `formato_participacao=individual` também direciona a geração para sessões, impedindo representante individual em mata-mata previsto no plano. Rever o `id_turma NOT NULL` do nó por nova migração, sem editar migrations aplicadas.

**Aceite:** três turmas × uma equipe produzem dois jogos e um BYE; quatro turmas × uma equipe produzem três jogos; duas categorias nunca se enfrentam; N entradas por turma continuam estáveis. Cobrir também individual em mata-mata, dupla em mata-mata e prova por marcas.

### A02 — P1: materialização pode escolher modalidade ou vencedor incorretos

As tags de mata-mata contêm turma/fase/slot, mas não modalidade. O parâmetro `$modalityId` do planejador não participa da identidade. A reprodução com modalidades 7 e 8 na turma 11 gerou três tags idênticas. `materializeNode` procura por edição/versão/tag com `LIMIT 1`, sem modalidade; portanto não consegue distinguir os dois nós.

Além disso, `plannedNodeParticipants` trata qualquer origem BYE escolhendo a primeira equipe candidata. Com seis entradas, existe um BYE intermediário com candidatos 5 e 6 e origem em um jogo normal; escolher a menor equipe ignora o vencedor desse jogo. A resolução de vencedor por maior placar e menor ID também precisa respeitar o contrato de desempate, sem escolher arbitrariamente em empate.

Evidência: `CronogramaBracketPlanner.php:90`, `MysqliCronogramaRepository.php:353` e `:431`. A colisão e o BYE intermediário com dois candidatos foram reproduzidos sem banco; o efeito na materialização foi identificado por inspeção, ainda sem regressão SQL dedicada nesta auditoria.

**Ajuste:** usar ID persistido de nó com validação de edição/versão ou identidade composta completa; resolver BYEs recursivamente pelas origens e reutilizar a regra canônica de vencedor. Substituir as tags ambíguas em todos os produtores e consumidores, sem aliases nem resolução do formato anterior. Atualizar as fixtures para o contrato final.

**Aceite:** duas modalidades da mesma turma materializam os jogos corretos; seis entradas com vitória da equipe 6 não promovem a equipe 5; origem não concluída impede avanço; repetição não duplica jogo/partidas; empate não promove por ID.

### A03 — P1: publicação aceita cronograma incompleto e não revalida toda a integridade

`validateCommitments` verifica se cada compromisso referencia um nó, mas não exige o inverso. A cobertura das equipes e modalidades já é preenchida pelos nós. Assim, uma árvore válida acompanhada de `compromissos=[]` pode atravessar a validação; `insertCommitments` retorna imediatamente para lista vazia e a publicação prossegue. Nós normais ficam sem data/local, contrariando R05.

A publicação também não confere integralmente escopo das equipes candidatas e turmas dos nós, integridade das origens, ordem temporal de fases e pertencimento/disponibilidade do local à edição. Chaves estrangeiras de IDs isolados não garantem esses vínculos. Reservas são consultadas na geração, mas não revalidadas em `publish`. Um rascunho alterado pelo cliente ou uma reserva criada depois da simulação pode violar o contrato.

O guard compartilhado `MysqliLocalScheduleGuard::conflict` consulta jogos e `agenda_reservas`, mas não os compromissos novos. A publicação não escreve essas reservas e a materialização insere jogos diretamente. É necessário integrar essas fontes para que um jogo manual não ocupe um horário já publicado no cronograma e para que a materialização respeite conflitos criados posteriormente.

Evidência: `MysqliCronogramaRepository.php:255`, `:518` e `:551`.

**Ajuste:** tornar a publicação a barreira definitiva de integridade, dentro da mesma transação: conjunto esperado de nós, origens acíclicas e existentes, candidatos coerentes, cobertura exata dos nós físicos, intervalos válidos, locais elegíveis, reservas atuais, descansos e impacto nos inscritos. Derivar candidatos no servidor em vez de confiar no payload.

**Aceite:** remover qualquer compromisso obrigatório/condicional, trocar equipe/turma/local por outra edição, criar ciclo, inverter final e semifinal ou inserir reserva concorrente deve recusar a operação sem publicar parte dos dados. BYE estrutural permanece sem partida física.

### A04 — P1: inscrição do aluno ignora a janela e a versão apresentada

`MysqliInscricaoRepository::assertScheduleCompatibility` consulta apenas `cronograma_status` e `inscricoes_status` antes de chamar `assertPlannedEdition`. A regra suporta abertura/encerramento, mas não recebe as datas. `planningState` lê as datas, porém esse resultado não é passado à validação temporal. A inclusão administrativa usa uma consulta diferente e inclui os campos, criando comportamento inconsistente.

`InscricaoService::inscrever` recebe somente edição e equipes e não exige nem encaminha `versao_cronograma`, apesar do contrato documentado. Uma escolha baseada em publicação antiga não é recusada por revisão divergente. As mutações de cronograma bloqueiam a linha de `interclasse_planejamentos`, enquanto a inscrição bloqueia inicialmente `interclasses`; é necessário unificar a sincronização entre revisão/fechamento e inscrição.

Evidência: `src/Modules/Participantes/Infrastructure/MysqliInscricaoRepository.php:302`, `:379` e `src/Modules/Participantes/Application/InscricaoService.php:22`.

**Ajuste:** exigir versão no contrato HTTP/cliente, ler e bloquear o planejamento atual, validar janela `[abertura, encerramento)` no fuso configurado e versão antes de persistir. Compartilhar a política com inclusão/transferência administrativa. Usar relógio injetável nos testes e parsing estrito das datas.

**Aceite:** recusar antes da abertura, exatamente no encerramento, versão ausente/antiga e fechamento concorrente; aceitar exatamente na abertura. Verificar via HTTP autenticado como aluno, não somente chamando a regra isoladamente.

### A05 — P1: lote de inscrições não é atômico quando uma escolha é inválida

O repositório acumula erros e continua tanto na validação das equipes quanto na capacidade. Ao final faz `commit` das escolhas restantes e pode retornar sucesso com erros. Exemplo: equipe A válida e equipe B lotada resulta em inscrição somente em A. Uma transação não impede esse resultado porque os erros de negócio não provocam rollback. Contraria R10 e a afirmação de T06 no STATUS.

Evidência: `MysqliInscricaoRepository.php:57`, `:185` e `:238`.

**Ajuste:** validar todas as escolhas sob os locks adequados antes de gravar ou lançar exceção de domínio diante de qualquer escolha inválida; preservar inscrições preexistentes e idempotência. Duas equipes da mesma modalidade devem ter contrato explícito, sem escolher silenciosamente a primeira.

**Aceite:** uma válida + uma lotada/inativa/inexistente/de outra turma não gera nenhum vínculo novo; sucesso de três escolhas gera exatamente três; disputa pela última vaga não excede capacidade; reenviar não duplica.

### A06 — P1: republicação não avalia os conflitos dos alunos já inscritos

`publish` compara candidatos de equipes e locais entre compromissos; não consulta os vínculos dos alunos para comparar modalidades distintas. Se um aluno já participa das equipes A e B, uma republicação pode colocar seus jogos no mesmo horário em locais diferentes. As equipes são diferentes e não há conflito de recurso, então essa comparação não bloqueia a agenda. Também usa margem fixa de recurso e zero de equipe em vez de aplicar integralmente descanso/deslocamento configurados.

Evidência: `MysqliCronogramaRepository.php:610`; validações de inscrição em `MysqliInscricaoRepository.php:326` e `MysqliEquipeRepository.php:299`, ambas com margem zero.

**Ajuste:** política única de disponibilidade para inscrição, elenco, revisão e rotas administrativas que alteram horários; calcular todos os caminhos possíveis, descanso e deslocamento. Na republicação, avaliar inscritos existentes e retornar pendências identificáveis antes de trocar a publicação.

**Aceite:** aluno em duas modalidades bloqueia republicação conflitante mesmo em locais distintos; final possível é considerada; mesma modalidade não é comparada consigo; fronteiras com margem zero/positiva são verificadas; todas as rotas administrativas mantidas aplicam a regra. Remover endpoints substituídos em vez de manter adaptadores de compatibilidade.

### A07 — P1: liberação operacional não respeita mínimos e fechamento

`materializeNode` permite inscrições abertas e `teamsHaveRoster` só exige um vínculo por equipe. Uma equipe com mínimo cinco pode gerar jogo com um único aluno. Não há chamada da nova ação de materialização na interface da agenda examinada. Os testes específicos só verificam a recusa da equipe vazia, não a criação válida, o avanço completo ou o caminho utilizável na interface.

Evidência: `MysqliCronogramaRepository.php:350` e `:446`; `resources/js/pages/eventos/configurar-agenda.js:839`.

**Ajuste:** definir liberação operacional explícita após encerramento e resolução de mínimos/retiradas; contar participantes elegíveis; integrar materialização com o fluxo de jogos/resultados e interface. Preservar vínculo obrigatório dos pontos (o schema atual já tem default 1; sua ausência no INSERT, por si só, não constitui defeito).

**Aceite:** mínimo−1 recusa, mínimo aceita; inscrições abertas não liberam operação; concluir semifinal promove o vencedor correto à final, com pontuação e operação offline preservadas.

### A08 — P2: revisão e interface deixam estado inconsistente ou obsoleto

`review` incrementa a versão sem copiar os nós/compromissos; `state` consulta apenas a versão nova. O snapshot antigo existe no banco, mas desaparece dessa resposta, contrariando a última publicação visível/suspensa. Alterações de modalidade incrementam a versão somente quando o estado era publicado; alterações sucessivas durante revisão não invalidam rascunhos antigos.

Na interface, publicar e abrir são duas requisições. Se a primeira funciona e a segunda falha, o estado local não é atualizado; repetir tenta publicar sobre estado já publicado. Não há ações independentes no painel para abrir/encerrar, nem campos de período de inscrição. Alterar a janela após gerar não invalida `cronogramaRascunho`. O botão revisar fica desabilitado após sucesso, sem restauração na atualização do painel.

Os campos `requer_repreparo_mesario` e `fila_offline_preservada` são emitidos pelo repositório, mas não possuem consumidor em `resources/` na revisão auditada. O booleano fixo sobre preservação da fila não é evidência de tratamento de uma revisão do cronograma enquanto o mesário opera offline na mesma versão do software.

Evidência: `MysqliCronogramaRepository.php:27`, `:328`; `MysqliModalidadeRepository.php:261`; `configurar-agenda.js:847–884`.

**Ajuste:** separar revisão de trabalho e versão publicada; manter consulta do snapshot suspenso; incrementar revisão em toda mutação relevante; vincular prévia à revisão e aos parâmetros. Separar publicar/abrir/encerrar e reconciliar estado após qualquer resposta parcial ou falha de rede. Integrar aviso de versão obsoleta à preparação offline, preservando a fila.

**Aceite:** duas abas não sobrescrevem alterações; mudança de campo invalida prévia; falha na abertura permite tentar apenas abertura; revisão preserva agenda visível e operações pendentes; repetir o ciclo publicar/revisar funciona sem recarregar a página.

## 3. Qualidade da implementação

Há decisões adequadas: regras puras para intervalos, planejamento separado de jogos reais, consultas preparadas, transações na persistência, validação de perfis no controlador, composição explícita em rotas e listeners registrados pelo runtime compartilhado. Esses componentes podem ser preservados.

O principal problema estrutural é concentrar planejamento, política de publicação, máquina de estados, disponibilidade e materialização em um repositório SQL de quase 800 linhas. `CronogramaService` funciona principalmente como repassador. A política de disponibilidade está duplicada nos repositórios de inscrição e equipes; a omissão das datas em apenas um deles já demonstra a consequência dessa duplicação.

Após congelar os comportamentos com regressões, extrair políticas puras de estrutura/publicação/disponibilidade para Domain e coordenação para Application usando `TransactionRunner`. Manter SQL e locks em Infrastructure. Preferir tipos/objetos de entrada com campos explícitos onde os arrays ambíguos já causam erros, sem criar um framework de abstrações.

Itens adicionais a incluir na revisão: sincronizar mínimos/máximos das equipes existentes ao alterar modalidade (`prepareTeams` ignora metadados de ordinais já presentes); alocar jogos independentes simultaneamente em recursos diferentes (o cursor global atual serializa todos); validar datas/horários isoladamente, sem depender de haver um segundo compromisso para detectar intervalo inválido. São melhorias de consistência/capacidade, posteriores aos bloqueadores.

## 4. O que os testes realmente demonstram

| Camada | Evidência existente | Lacuna material |
| --- | --- | --- |
| Unitários de regras | Configuração básica, sobreposição, um horário dentro da janela e recusa de rascunho | Não verificam fronteiras da janela, projeção SQL das datas, contrato HTTP ou concorrência; o caso de dupla inválida falha antes, na comparação mínimo/máximo |
| Unitários de chaveamento | Contagem de nós/BYEs para 3, 4, 6 e 8 entradas | Uma única turma/modalidade; não verificam vencedor, materialização, colisão entre modalidades ou competição entre turmas |
| Integração específica | Geração/publicação/abertura, projeção condicional, equipe vazia, conflito administrativo e preservação do snapshot no banco | Chama serviços diretamente; desativa outras turmas; não usa a inscrição HTTP do aluno; não cobre lote parcial, datas, revisão antiga, republicação conflitante ou criação válida de jogos |
| Navegador específico | Painel visível e clique em revisar com resposta simulada | `page.route` substitui APIs; qualquer POST incrementa a revisão, sem validar ação/payload; não comprova persistência nem fluxo completo |
| Contrato visual | Dois testes de acesso/login, desktop e mobile | Não verifica visualmente o painel e os estados do cronograma |
| Migrações | Criação de tabelas e reaplicação | Não prova integridade de publicação ou política de inscrição; atualização de versões antigas está fora do escopo ajustado |
| Offline e demais suítes | Proteção dos fluxos existentes | Não substitui cenário de nova publicação com fila pendente e dados de mesário obsoletos |

Há ainda asserções com nomes mais fortes que seu conteúdo: “A geração persiste a árvore planejada sem jogos reais” só compara contagens do array retornado. Não consulta persistência nem ausência de jogos. A revisão verifica linhas antigas no banco, não sua visibilidade pela API. Corrigir asserções e nomes para que a evidência corresponda ao que se afirma.

## 5. Plano de execução e ordem de entrega

1. **Definir o contrato final e reproduzir falhas.** Documentar a única estrutura aceita de nós, payloads, revisões e dados offline. Criar fixtures pequenas independentes, com 3/4 turmas, duas modalidades e duas categorias. Adicionar regressões dos A01–A08 nas suítes já descobertas pelo projeto, demonstrando falha antes da correção. Conferir permissões reais das rotas, CSRF, isolamento de edição e dados retornados ao aluno. Atualizar STATUS para distinguir entrega de validação incompleta.
2. **Corrigir estrutura e identidade (A01/A02).** Alterar planejador, modelo dos nós e resolução de origens, atualizando todos os consumidores na mesma entrega. Evoluir SQL por nova migração conforme a disciplina do repositório; isso não exige manter o contrato antigo na aplicação. Eliminar tags ambíguas e caminhos substituídos. Validar instalação vazia e repetição nos dois motores, com fixtures novas; não implementar conversores nem testar atualização de instalações antigas. Dentro do contrato final, uma revisão de agenda não deve regenerar destrutivamente uma competição já iniciada.
3. **Fechar publicação e concorrência (A03/A06).** Implementar validação integral no servidor e política de disponibilidade compartilhada. Definir ordem única de locks e revisão de trabalho. Cobrir rollback com falha intermediária e publicação concorrente com reserva/alteração de elenco.
4. **Corrigir inscrição (A04/A05).** Substituir o contrato cliente/API/repositório para exigir revisão e validar janela, tornar lote indivisível e unificar política administrativa. Remover aceitação do payload substituído; não inferir versão ausente. Criar HTTP real com tokens legítimos, testes de última vaga, reenvio e fechamento concorrente.
5. **Integrar operação e revisão (A07/A08).** Liberar com mínimos resolvidos, materializar/avançar pelo fluxo canônico e manter agenda suspensa consultável. Completar painel, recuperação de falhas e sinalização de repreparo offline após revisão do evento. Atualizar o formato offline junto com o servidor, sem migração de filas de versões anteriores do software. Testar preservação e identidade das mutações criadas pelo contrato final durante desconexão, revisão do evento e reconexão.
6. **Refatorar com proteção.** Executar suíte completa antes/depois de extrair serviços/políticas; reduzir duplicação e repositório excessivo. A migração arquitetural pode acompanhar os passos anteriores, desde que cada commit permaneça verificável e completo.
7. **Homologar ponta a ponta.** Playwright sem mocks das APIs do fluxo: criar configuração → preparar → gerar → publicar → abrir → inscrever como aluno → encerrar → resolver mínimos → jogar → avançar → revisar. Repetir com subdiretório, duas abas e mesma aba offline preparada. Os mocks continuam úteis apenas para falhas controladas e testes de apresentação.

Cada etapa deve entregar código, testes de regressão, comandos/resultados e documentação de contratos alterados. Não adicionar skips, relaxar asserções nem atualizar snapshots para disfarçar falhas. Não editar migrações aplicadas. Commits sugeridos por escopo: estrutura/identidade; publicação/disponibilidade; inscrição atômica/versionada; operação/revisão; interface e testes ponta a ponta.

**Critério final de aceite:** regressões específicas aprovadas; perfil completo com visual em MariaDB; instalação limpa/repetição/integração pertinente em MySQL; um único contrato implementado sem caminhos legados; nenhuma publicação incompleta; nenhum vínculo parcial; nenhum avanço arbitrário; nenhuma perda de histórico ou fila durante operação normal do contrato final; CI remoto verde antes da integração. Compatibilidade e migração de dados entre versões antigas do software não fazem parte do aceite. Registrar separadamente execuções locais e remotas.

## 6. Execuções desta auditoria

Registros em `test-results/auditoria-cronograma-20260922/`. Executor quality iniciado às 07:21:46 e Docker completo às 07:22:51, America/Sao_Paulo. O diretório do executor Docker usa UTC. Versão auditada: `c88a5b0d`; ambiente Windows, PHP local 8.4.25; containers de teste PHP 8.4/MariaDB 10.11. URL interna do teste de navegador: `http://sgi-web:8099/`, acessível apenas no ambiente de testes. Nenhuma URL de produção foi utilizada.

- `php vendor/bin/phpunit --configuration phpunit.xml`: 384 testes, 2.671 asserções, exit 0; uma depreciação do PHPUnit. A mensagem de falha interna em `/api/v1/fail` pertence ao cenário sintético de erro.
- `powershell -ExecutionPolicy Bypass -File tools/test-local.ps1 -Suite quality`: exit 0; PHPUnit 384/2.671, lint, PHPStan, estilo, build e checagem JavaScript aprovados; 129 testes JavaScript, zero falhas. Resultado registrado em `quality.log` e artefatos oficiais `test-results/local-20260922_072146_adb62c/`.
- `php test-results/auditoria-cronograma-20260922/probes.php`: reprodução exploratória sem banco, resultado em `probes.log`. Confirma tags duplicadas, BYE único e candidatos múltiplos em BYE intermediário. Este script não substitui testes de regressão integrados.
- A primeira tentativa de Docker no sandbox falhou por acesso a `.docker/buildx/instances` (`docker.log`). `docker info` fora do sandbox retornou versão 29.8.0; isso corrigiu o diagnóstico inicial de indisponibilidade.
- `powershell -ExecutionPolicy Bypass -File tools/test-docker.ps1 -Database mariadb -IncludeVisual`: exit 0; qualidade aprovada; integração 1.011/1.011 asserções; navegador 166 aprovados e dois intermitentes que passaram na repetição automática (168 cenários, 9,3 minutos); visual 2/2. Execução fora do sandbox registrada em `docker-completo.log`, encerrada por volta de 07:35 com containers, volume de sessões e rede removidos pelo executor. O perfil terminou com sucesso, mas houve falhas nas primeiras tentativas: não foi uma execução sem intercorrências.
- `git diff --check`: sem erros após a documentação. Links relativos do relatório conferidos e existentes.

### Falhas intermitentes observadas e localização dos registros

| Cenário | Esperado | Observado na primeira tentativa | Resultado final |
| --- | --- | --- | --- |
| `e05-pdf-import-accessibility.spec.cjs:303` | Mensagem “Importação concluída” após envio do PDF | `#msgPdfDesk` vazio até timeout de 20 s | Passou no retry automático |
| `e05-selection-accessibility.spec.cjs:361` | Campo de senha mascarado com `type=password` | `#novaSenhaColaborador` com `type=text` até timeout de 20 s | Passou no retry automático |

Esses cenários falharam no código auditado, sem mudanças funcionais desta tarefa. Não foi determinada sua causa; não atribuir automaticamente a lentidão do ambiente nem afirmar relação causal com o cronograma. Reproduzir e investigar em tarefa própria antes de tratar a suíte como estável. A execução visual posterior reutilizou o diretório de saída e os artefatos das falhas já não estavam presentes ao encerrar a auditoria; os erros textuais continuam no log principal.

- Log textual principal: `test-results/auditoria-cronograma-20260922/docker-completo.log`. Localizar o nome do spec para consultar erro, esperado/observado, stack e os caminhos originais de screenshot/trace, que já não existem após o perfil visual.
- Logs de aplicação/servidor e banco capturados pelo Compose: `test-results/docker-20260922_102251_27f994/docker-compose.log`. O identificador comum da execução é `20260922_102251_27f994`; correlacionar horário, rota e cenário. Não há comprovação nesta auditoria de um identificador de requisição propagado de ponta a ponta.
- Os `error-context.md` dos dois cenários foram lidos durante a execução e confirmaram os valores da tabela. Os subdiretórios foram removidos na execução visual subsequente. Não é possível entregar os traces/screenshots daquela primeira tentativa como evidência preservada.
- Relatório HTML configurado pelo executor: `tests/browser/playwright-report/docker-20260922_102251_27f994/`. O perfil visual usa o mesmo destino e substitui o relatório anterior. **Ajuste adicional de infraestrutura de testes:** separar saída e relatório por perfil (`browser/` e `visual/`) dentro de cada execução, preservando os artefatos de falha mesmo quando a repetição passa. Cobrir o contrato dos caminhos no executor e verificar retenção na execução completa seguinte.

Não foi realizada nesta revisão uma execução adicional MySQL nem validação de CI remoto. Os defeitos classificados por inspeção ainda precisam dos testes reproduzíveis especificados acima; sua ausência na suíte atual é parte do parecer.
