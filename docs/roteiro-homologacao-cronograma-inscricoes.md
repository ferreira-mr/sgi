# Roteiro de homologação — cronograma e inscrições dos alunos

## 1. Objetivo e identificação

Verificar se a organização consegue planejar os jogos antes das inscrições e se os alunos conseguem escolher suas modalidades e equipes com segurança, respeitando vagas, horários e regras da edição.

Roteiro elaborado a partir da branch `codex/cronograma-inscricoes-luna-2026-09-21`, referência `1f60f4e8`. Os resultados esperados abaixo são critérios a verificar, não uma declaração de que a homologação já foi executada ou aprovada.

| Informação da rodada | Preencher antes de começar |
| --- | --- |
| Data e horário, com fuso | |
| URL do ambiente de homologação | |
| Branch e commit realmente disponibilizados | |
| Alterações locais adicionais à versão | |
| Nome e identificação da edição de teste | |
| Responsável pela organização e suporte | |
| Grupo de alunos / identificação da execução | |
| Dispositivos, navegadores e versões | |

**Como funciona:** o aluno se inscreve em uma equipe de cada modalidade, até o limite total de três modalidades. Não escolhe uma partida isolada. O cronograma considera também fases que sua equipe poderá disputar se avançar, como semifinal e final.

## 2. Preparação pela organização

- [ ] Disponibilizar ambiente e dados exclusivos de homologação, sem alterar inscrições ou resultados reais. Para acesso por várias máquinas, conferir a URL em outro dispositivo da mesma rede, conforme o [guia do projeto](../AGENTS.md).
- [ ] Separar uma conta de administrador ou colaborador autorizado para as ações de organização e contas individuais de aluno para os participantes. Não compartilhar a conta administrativa com a turma inteira.
- [ ] Preparar alunos de turmas e categorias diferentes, com os gêneros necessários aos cenários, e pelo menos duas contas da mesma turma para disputar a última vaga.
- [ ] Informar matrículas e credenciais por canal reservado. Usar identificadores fictícios nas evidências deste roteiro.
- [ ] Preparar locais ativos, turmas e modalidades da edição, com quantidade planejada de equipes por turma, mínimo e máximo de inscritos e formato de participação.
- [ ] Preparar quatro modalidades compatíveis com um mesmo aluno para testar o limite de três. Reservar horários compatíveis para o caso de sucesso.
- [ ] Separar cenários de horários conflitantes e de última vaga. A organização deve anotar previamente quais escolhas serão aceitas ou recusadas.
- [ ] Reservar edições ou conjuntos de dados separados para configurações inválidas e revisão. Não interromper a inscrição dos demais grupos sem combinar a etapa.
- [ ] Registrar os caminhos reais dos logs de aplicação e servidor e o responsável por coletá-los. Não colocar senhas, tokens ou dados pessoais nas evidências.

### Dados de referência sugeridos

| Conjunto | Preparação e finalidade |
| --- | --- |
| Cronograma básico | Três turmas da mesma categoria, uma equipe por turma em uma modalidade mata-mata. Esperado: dois confrontos físicos e uma passagem automática (BYE). |
| Cronograma com quatro entradas | Quatro turmas da mesma categoria, uma equipe por turma. Esperado: duas semifinais e uma final. Usar cenário separado do anterior. |
| Inscrição sem conflito | Modalidades A, B e C com vagas e todos os caminhos possíveis em horários compatíveis; modalidade D disponível para testar o excesso. |
| Inscrição com conflito | Modalidades X e Y em locais distintos, mas com horários sobrepostos para o mesmo aluno; outro par em que apenas uma possível final conflita. |
| Capacidade | Equipe com exatamente uma vaga restante e dois alunos elegíveis; equipe já lotada; equipe abaixo do mínimo de participantes. |
| Formatos | Uma modalidade individual com mínimo/máximo 1 e uma de duplas com mínimo/máximo 2. |

A organização deve fornecer os nomes reais correspondentes a A, B, C, D, X e Y. Não é necessário que cada aluno execute todas as combinações: distribuir os casos entre os grupos e consolidar as evidências.

## 3. Como executar e registrar

1. Executar os blocos na ordem: preparação do cronograma → inscrições → revisão → encerramento e operação.
2. Nos casos negativos, uma recusa clara é o resultado correto. Conferir sempre se os dados permaneceram como estavam.
3. Marcar cada caso como **Aprovado**, **Reprovado**, **Bloqueado** ou **Não executado**. Falta de conta, dados ou acesso é bloqueio, não aprovação.
4. Após uma gravação, atualizar a página e conferir o resultado; quando indicado, sair e entrar novamente. Uma mensagem de sucesso sozinha não comprova persistência.
5. Registrar um problema por ocorrência, usando o modelo ao final. Se a interface não permitir executar uma etapa, registrar a limitação e pedir apoio; não improvisar alterações no banco.

Tempo sugerido: uma aula para os cenários principais e uma segunda rodada para concorrência, revisão e retestes. A organização deve preparar os dados antes da aula.

## 4. Bloco C — geração e publicação do cronograma

**Quem executa:** organização, com alunos observando e conferindo os resultados. Abrir a edição e sua agenda (`/edicoes/agenda?id=ID_DA_EDICAO`), no painel **Cronograma antes das inscrições**. Os caminhos deste documento são relativos à URL do ambiente, incluindo eventual subdiretório.

| ID | Passos | Resultado esperado |
| --- | --- | --- |
| C01 | Na configuração de modalidades da edição, conferir quantidade de equipes por turma, mínimo, máximo e formato. Tentar salvar mínimo maior que máximo e quantidade zero. Depois salvar valores válidos. | Valores inválidos são recusados; os válidos permanecem após atualizar. Dupla exige dois participantes e individual exige um. |
| C02 | Com cronograma em rascunho e inscrições fechadas, clicar em **Preparar equipes**. Conferir as equipes por turma. Repetir a preparação sem alterar a configuração. | Quantidade e vínculos correspondem à configuração. A repetição não duplica equipes e não cria inscrições de alunos. |
| C03 | Preencher **Primeiro dia**, **Último dia**, **Início**, **Fim** e **Duração (min)**. Clicar em **Gerar rascunho** com janela suficiente. | O painel informa nós e compromissos gerados, sem pendências. Gerar não abre inscrições nem inicia partidas. Um nó é uma etapa do chaveamento; um compromisso é a reserva de data, horário e local. |
| C04 | Em cenário separado, tentar data final anterior à inicial, hora final anterior à inicial e duração zero. Tentar também uma janela curta demais para todos os jogos. | Entradas inválidas são recusadas. Falta de horários produz recusa ou pendências e impede publicar uma grade incompleta. |
| C05 | Conferir a grade do cenário de três turmas e depois a de quatro turmas. Comparar participantes, categoria e sequência das fases. | Há confrontos entre turmas da mesma categoria. Três entradas produzem dois jogos e um BYE; quatro produzem três jogos. BYE não ocupa uma partida física. A final ocorre depois de suas fases de origem. |
| C06 | Conferir data, início, término e local de cada compromisso. Incluir uma reserva prévia de local e modalidades com descanso configurado. | Jogos respeitam janela, duração, reservas e descanso. Um local ou uma equipe candidata não fica em compromissos incompatíveis. |
| C07 | Clicar em **Publicar cronograma** com a proposta válida. Atualizar a página. Tentar inscrever um aluno antes de abrir as inscrições. | O estado fica `publicado`, a grade persiste e as inscrições continuam fechadas. Publicar e abrir inscrições são ações separadas. |
| C08 | Tentar **Abrir inscrições** sem período válido. Em seguida preencher **Abertura das inscrições** e **Encerramento das inscrições**, com início anterior ao fim, e abrir. | Período inválido é recusado. Com período válido, a abertura é registrada; a inscrição só é permitida dentro desse período. |

**Apoio técnico para C05–C06:** o painel atual resume quantidades; não presumir que ele mostre toda a grade planejada ou todos os candidatos de cada fase. Se os detalhes não estiverem acessíveis na tela, o responsável técnico deve conferir a consulta autenticada `/api/v1/cronograma?id_interclasse=ID_DA_EDICAO` e fornecer a grade aos alunos. Registrar separadamente a evidência técnica e a dificuldade de consulta na interface. A lista de jogos operacionais não substitui a conferência dos compromissos planejados.

## 5. Bloco I — inscrições dos alunos

**Quem executa:** alunos, em suas próprias contas. Usar o acesso do aluno (`/aluno/login`) e a página de modalidades (`/aluno/modalidades`). A organização acompanha vagas e elencos sem executar as escolhas pelo aluno.

| ID | Passos | Resultado esperado |
| --- | --- | --- |
| I01 | Entrar com a matrícula e credencial fornecidas. Se solicitado, trocar a senha inicial e ler/aceitar os termos. Conferir a identificação da conta e edição. | O acesso pertence ao aluno correto. Troca obrigatória e termos são exigidos antes de liberar o fluxo protegido. |
| I02 | Abrir modalidades. Comparar as opções com turma, categoria e gênero do aluno. Abrir uma opção e conferir **Escolha a equipe**. | As opções respeitam categoria e gênero, incluindo modalidades mistas compatíveis. A seleção oferece equipes da própria turma e modalidade. |
| I03 | Selecionar uma modalidade, escolher a equipe e depois desmarcar a escolha antes de salvar. | O contador e a seleção acompanham a alteração. Nenhuma inscrição é criada apenas por selecionar ou desmarcar. |
| I04 | Escolher A e uma equipe com vaga. Clicar em **Salvar**. Voltar às modalidades, atualizar e entrar novamente na conta. A organização confere o elenco. | A inscrição aparece confirmada na equipe correta e permanece após novo acesso. O elenco contém o aluno uma única vez. |
| I05 | Partindo da inscrição em A, adicionar B e C, compatíveis com todos os horários de A. Depois tentar selecionar D. | As três inscrições são preservadas. A quarta modalidade é bloqueada, inclusive quando as escolhas foram feitas em momentos diferentes. |
| I06 | Com outra conta sem inscrições, selecionar três modalidades válidas de uma vez e salvar. | As três escolhas são confirmadas, cada uma na equipe selecionada, sem duplicação ou troca silenciosa de equipe. |
| I07 | Tentar selecionar modalidade ou equipe lotada. Para testar a conferência no envio, deixar a seleção aberta enquanto outro aluno ocupa a vaga e só depois salvar. | O sistema impede ultrapassar o limite, inclusive quando a tela estava desatualizada. A recusa não aparece como sucesso. |
| I08 | Dois alunos da mesma turma abrem a equipe com uma única vaga restante. Ambos tentam salvar ao sinal da organização. Atualizar as duas contas e conferir o elenco. | Apenas um ocupa a vaga. O outro recebe recusa; o total de participantes não ultrapassa a capacidade. |
| I09 | Com conta de teste sem inscrições, selecionar duas modalidades válidas. Antes de salvar, outro aluno ocupa a última vaga de uma delas. Salvar as duas escolhas juntas. | O conjunto inteiro é recusado: nenhuma das duas novas inscrições é gravada. Inscrições que já existiam antes da tentativa são preservadas. |
| I10 | Tentar salvar X e Y, cujos jogos se sobrepõem, mesmo em locais diferentes. Repetir tendo X já confirmada e tentando acrescentar Y. | A inscrição incompatível é recusada nos dois casos. A mensagem permite identificar o conflito; a inscrição anterior em X permanece. |
| I11 | Tentar duas modalidades cujas primeiras fases não se sobrepõem, mas uma possível final conflita. Repetir com intervalo menor que o descanso configurado. | O sistema considera fases possíveis e descanso, recusando as escolhas incompatíveis mesmo sem saber ainda quem chegará à final. |
| I12 | Tentar inscrever antes da abertura, durante o período válido e depois do encerramento. A organização usa janelas curtas de teste e registra o horário do servidor. | Antes da abertura e a partir do encerramento a inscrição é recusada. Durante a janela, é aceita se as demais regras forem atendidas. Não alterar o relógio do dispositivo para simular o servidor. |
| I13 | Clicar rapidamente duas vezes em salvar e conferir novamente as inscrições e o elenco. Reabrir a página e repetir a tentativa quando a interface permitir. | O aluno não é duplicado e não consome duas vagas. A interface não cria várias confirmações para uma única escolha. |
| I14 | Na conta com inscrições, abrir seus detalhes e consultar os jogos em `/aluno/jogos` após a organização disponibilizar jogos operacionais. Conferir modalidade, equipes, data, horário e local. | Os dados correspondem aos jogos disponibilizados. Não tratar um horário de possível final como presença garantida. Se não houver jogos operacionais, registrar esse pré-requisito, sem confundir ausência de jogos com perda de inscrição. |

**Última vaga:** usar contas diferentes em dispositivos ou perfis de navegador separados. Duas abas da mesma sessão representam o mesmo aluno e não comprovam disputa entre pessoas distintas.

## 6. Bloco R — revisão, tela antiga e encerramento

**Quem executa:** organização e um grupo de alunos, após os casos de inscrição. Anotar inscrições e grade antes de iniciar.

| ID | Passos | Resultado esperado |
| --- | --- | --- |
| R01 | Um aluno deixa a seleção aberta sem salvar. A organização clica em **Reabrir revisão**. O aluno tenta salvar na tela antiga. | O cronograma entra em `revisao`, as inscrições ficam fechadas e a tentativa antiga é recusada. Inscrições já confirmadas e a publicação anterior não são apagadas. |
| R02 | Gerar uma nova proposta que faça horários de dois elencos de um mesmo aluno coincidirem. Tentar publicar; depois corrigir os horários e publicar novamente. | A proposta conflitante é recusada sem substituir parcialmente a publicação anterior. A válida pode ser publicada preservando inscrições. |
| R03 | Depois da nova publicação e abertura, tentar salvar por uma aba de aluno que continuou aberta desde a versão anterior. Em seguida atualizar a página e refazer uma escolha válida. | A versão antiga é recusada com orientação para atualizar. A tentativa feita com a versão atual segue as regras normais. |
| R04 | Abrir a agenda em duas abas administrativas. Revisar/publicar pela primeira e tentar uma ação baseada no estado antigo pela segunda. | A aba antiga não sobrescreve silenciosamente o trabalho atual. Após atualizar, mostra o estado vigente. |
| R05 | Executar novamente o ciclo publicar → abrir → encerrar → revisar quando os dados permitirem. Observar se os botões voltam a permitir as ações válidas. | A interface acompanha o estado do servidor. Botão permanentemente desabilitado ou necessidade inesperada de recarregar deve ser registrada como problema. |
| R06 | Clicar em **Encerrar inscrições** enquanto um aluno mantém uma seleção aberta. Pedir que ele salve. | A nova inscrição é recusada; as já confirmadas permanecem. A tela administrativa indica inscrições encerradas. |
| R07 | Tentar **Liberar operação** com inscrições abertas e, depois, com inscrições encerradas mas alguma equipe abaixo do mínimo. | As duas tentativas são recusadas. Equipe vazia ou incompleta não é liberada silenciosamente. |
| R08 | A organização regulariza os elencos pelo fluxo permitido, reabrindo uma janela válida quando necessário, e encerra novamente. Clicar em **Liberar operação**. | Com todos os mínimos atendidos e inscrições encerradas, a operação é liberada. Publicar cronograma, por si só, não libera jogos. |

Se a interface não oferecer uma forma de corrigir o cenário sem apagar dados, registrar o bloqueio para a equipe técnica. Não excluir inscrições ou históricos para fazer o teste passar.

## 7. Bloco U — uso em celular, acesso e recuperação

| ID | Passos | Resultado esperado |
| --- | --- | --- |
| U01 | Repetir I02–I04 no celular. Abrir/fechar o seletor de equipe e rolar até salvar. No computador, repetir a seleção com Tab, Enter e Espaço. | Textos, vagas, foco e botões são legíveis e alcançáveis; o modal não prende a navegação nem provoca seleção dupla. |
| U02 | Navegar entre início, modalidades e jogos e retornar várias vezes. Fazer uma escolha ao voltar. | A navegação preserva os dados confirmados e cada ação ocorre uma única vez. |
| U03 | Em cenário coordenado, interromper a conexão antes de salvar uma inscrição. Registrar a mensagem. Reconectar, consultar a conta e só então repetir se ainda necessário. | Não há confirmação falsa. Após reconectar, o estado real pode ser conferido e eventual nova tentativa não duplica a inscrição. Inscrição offline de aluno não é um fluxo prometido. |
| U04 | Com conta de aluno, tentar abrir a URL administrativa da agenda fornecida pela organização. Tentar acessar uma edição de teste diferente pelo endereço. | O aluno não consegue gerar, publicar, abrir ou encerrar inscrições, nem acessar dados protegidos de outra edição. A proteção vale mesmo conhecendo a URL. |
| U05 | Sair da conta e tentar reabrir as páginas protegidas ou usar uma aba antiga para salvar. | O sistema solicita autenticação ou recusa a ação, sem gravar uma inscrição anônima. |

## 8. Complementos acompanhados pela equipe técnica

Estes casos não exigem que os alunos manipulem requisições ou o banco. Registrar sua execução separadamente da experiência pela interface.

- **Grade completa:** conferir os compromissos e candidatos de todas as fases, categorias distintas, duas modalidades com equipes das mesmas turmas e formatos individual/dupla. Confirmar que não ocorre troca de modalidade nem de equipe.
- **Prévia desatualizada:** gerar rascunho, mudar parâmetros de horário/configuração e tentar publicar a proposta anterior. Verificar e registrar se o sistema exige nova geração ou aceita uma proposta que já não corresponde aos campos exibidos.
- **Reservas concorrentes:** criar uma reserva após gerar o rascunho e antes de publicar. A publicação não deve ocupar o horário reservado; uma tentativa recusada não deve deixar grade parcial.
- **Limites exatos de horário:** verificar aceitação exatamente na abertura e recusa exatamente no encerramento, com controle de tempo em ambiente de teste. Tentativas manuais aproximadas não comprovam esses limites.
- **Proteção no servidor:** verificar que requisições de inscrição sem sessão, sem CSRF válido, de outra edição/turma, com categoria ou gênero incompatível ou com versão ausente/antiga são recusadas sem criar vínculos. O bloqueio visual de um botão não basta para comprovar isso.
- **Operação dos jogos:** após R08, materializar os jogos pelo contrato atual e conferir participantes e horários. Repetir a operação não deve criar duplicatas. Concluir uma partida pelo fluxo normal e conferir avanço do vencedor; uma origem ainda não concluída não pode produzir vencedor arbitrário. Se não houver ação disponível na interface, registrar essa limitação e o meio técnico usado.
- **Revisão com mesário offline:** na mesma aba previamente preparada, manter uma operação pendente, revisar o cronograma e reconectar. Conferir preservação da fila, orientação para atualizar o preparo e ausência de resultados duplicados. Não limpar IndexedDB nem atualizar a página durante a etapa offline. Login e preparação exigem rede.

Referências para a equipe: [testes e ambiente isolado](testing.md), [integração de cronograma](../tests/Integration/CronogramaPlanejadoTest.php), [integração de inscrições](../tests/Integration/InscricaoModalidadesTest.php), [regras de cronograma](../src/Modules/Competicoes/Domain/CronogramaRules.php) e [rotas de páginas](../config/routes/web.php). A homologação manual complementa a suíte automatizada; não a substitui.

## 9. Registro de resultados e problemas

Copiar uma linha por caso executado. Cada grupo entrega sua própria tabela.

| Caso | Identificador do aluno/grupo | Dispositivo/navegador | Horário com fuso | Resultado | Evidência ou problema |
| --- | --- | --- | --- | --- | --- |
| | | | | Não executado | |

### Modelo de ocorrência

```text
Problema: HOM-___
Caso do roteiro:
Título curto:
URL/ambiente e edição:
Branch, commit e alterações adicionais:
Data/hora com fuso:
Conta fictícia/perfil utilizado:
Dispositivo e navegador:
Dados anteriores à tentativa (vagas, inscrições e estado do cronograma):
Passos para reproduzir:
Resultado esperado:
Resultado observado e mensagem exibida:
Estado após atualizar a página / conferência do elenco:
Screenshot ou gravação sem dados sensíveis:
Impacto: impede continuar / permite continuar com dificuldade / visual
Responsável pelo acompanhamento:
Reteste (versão, data e resultado):
```

O suporte acrescenta, quando disponível: identificação da execução/requisição, método e rota, status HTTP, duração, código do erro e caminho/formato dos logs de aplicação e servidor. Correlacionar pelo horário, cenário e identificador de requisição quando houver. Não anexar cookies, senhas, tokens ou respostas contendo dados pessoais desnecessários.

## 10. Encerramento e decisão

- [ ] Todos os casos C, I, R e U receberam resultado; bloqueados e não executados têm justificativa e responsável.
- [ ] Há evidências de publicação antes da abertura, inscrição persistida e limite de três modalidades.
- [ ] Foram conferidos capacidade/última vaga, conflito de horários e fases possíveis, recusa integral de escolhas inválidas e tela com versão antiga.
- [ ] Revisão e encerramento preservaram inscrições anteriores; a operação só foi liberada após cumprir seus requisitos.
- [ ] Cada falha foi registrada e os reparos foram retestados na versão identificada.
- [ ] A equipe técnica registrou separadamente os complementos executados, logs e limitações.

**Critério de aceite proposto:** não aprovar a rodada enquanto houver inscrição indevida, duplicidade, estouro de vagas, conflito de horários aceito, acesso indevido, perda de dados ou bloqueio do fluxo principal. Caso obrigatório bloqueado ou não executado deixa o aceite pendente. Problemas apenas visuais podem receber prazo de correção se não impedirem o uso e a organização registrar essa decisão.

| Fechamento | Preencher |
| --- | --- |
| Total aprovado / reprovado / bloqueado / não executado | |
| Problemas impeditivos e responsáveis | |
| Limitações e complementos ainda pendentes | |
| Versão usada nos retestes | |
| Decisão: aprovado / pendente / reprovado | |
| Responsável e data | |
