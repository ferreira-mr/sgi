# Etapas para produzir o manual

Executar em ordem. Registrar em [STATUS](STATUS.md) decisão, evidência, arquivo alterado e próxima ação após cada etapa. Este trabalho é documental: conferir contratos e comportamento, sem corrigir silenciosamente o produto para adequá-lo ao texto. Ao encontrar defeito, registrar reprodução e impacto na instrução; abrir correção separada quando autorizada.

## M00 — Baseline e delimitação

1. Ler `AGENTS.md`, README, arquitetura, testes, implantação e este pacote. Registrar `git rev-parse HEAD`, `git status --short`, data/fuso e mudanças preexistentes; não incluir trabalho alheio.
2. Verificar `config/routes/web.php` contra os capítulos previstos, caminhos do pacote e comandos de validação. Identificar se há alteração simultânea de telas/fluxos.
3. Fixar a versão do manual: revisão do código + estado do checkout. Se outros trabalhos mudarem a UI durante a redação, revisar a área antes de fechar aceites.

**Saída:** referência reproduzível, escopo e pendências iniciais no STATUS. **Aceite:** nenhuma instrução foi baseada apenas em documento histórico.

## M01 — Inventário fechado de tarefas, estados e permissão

1. Para cada linha A/E/C/D/R/S de [00-inventario](00-inventario.md), abrir view, JS, controlador/serviço, guarda e teste relevante. Registrar o rótulo visível e a ação correspondente, inclusive modais e telas acessadas por links contextuais.
2. Preencher uma matriz de rastreabilidade no STATUS ou em anexo do pacote: `ID | tarefa | perfil(s) | pré-requisitos | estado da edição | caminho pela UI | resultado | falha/recuperação | fontes | verificação no navegador`.
3. Verificar no servidor permissões de admin, colaborador, mesário e aluno; distinguir visualização de alteração e escopo da edição. Não inferir acesso pelo menu.
4. Resolver as dúvidas listadas no inventário. Marcar “sem função na UI atual” para hipóteses históricas não implementadas, sem incluí-las como procedimento. Registrar lacunas do produto separadas das lacunas de documentação.

**Saída:** matriz completa e sumário final. **Aceite:** toda rota de página relevante e toda tarefa principal têm destino documental ou justificativa explícita de exclusão.

## M02 — Ambiente e evidência das jornadas reais

1. Escolher ambiente de exploração com dados **sintéticos e isolados** conforme [AGENTS](../../AGENTS.md) e [README](../../README.md). Não executar seeds ou testes contra banco local de trabalho. Registrar URL, versão, processo e forma de limpeza no STATUS.
2. Preparar uma edição demonstrativa com categorias/turmas, modalidades por tipo, locais, equipes vazias, alunos e mesário fictícios. Se uma fixture existente já cobrir parte disso, confirmar que não substitui passos que precisam ser vistos na UI.
3. Percorrer J01–J06 pelo navegador, com cada perfil. Anotar estado inicial, ações, nomes exatos dos controles, mensagem de sucesso/erro e estado persistido após navegar ou recarregar. Conferir celular quando o layout/navegação diferir.
4. Capturar apenas estados necessários, especialmente: edição/configuração, prévia do cronograma, pendência, inscrição do aluno, placar, chaveamento, fila offline e ranking publicado/não publicado. Não salvar dados reais.

**Saída:** diário de observação e catálogo de capturas planejadas. **Aceite:** os procedimentos críticos foram observados, e as variantes não exercidas estão marcadas como pendentes, sem texto afirmativo.

## M03 — Índice, acesso e linguagem comum

1. Criar `docs/manual-usuario/README.md` e `01-acesso-e-conta.md` conforme [01-estrutura-e-padrao](01-estrutura-e-padrao.md).
2. Escrever caminho de entrada para cada perfil; explicar login único, sair, sessão expirada, senha pessoal do aluno, termos e perfil. Conferir nomes e regras de campos/erros.
3. Criar glossário e mapa visual da jornada: configurar edição → publicar cronograma → abrir inscrições → concluir elencos → liberar → registrar resultados → consultar classificação.
4. Inserir links de “próximo passo” e voltar ao índice. Não incluir credenciais de fixtures no manual público.

**Saída:** começo utilizável para os quatro perfis. **Aceite:** um leitor novo sabe como entrar e a ordem das etapas sem ler o README técnico.

## M04 — Administração e preparação da edição

1. Redigir `02-administrador-edicao.md` em tarefas pequenas: criar/selecionar edição, categorias, turmas, cadastro/importação de alunos, locais/regulamento, modalidades, regras de pontuação, equipes, colaboradores e resumo.
2. Para cada mutação, explicar pré-requisito, campo obrigatório, confirmação e efeito em outras telas; diferenças entre “salvar”, “gerar”, “publicar” e “ativar” precisam ficar claras.
3. Inserir caminhos alternativos apenas quando a UI os oferecer; identificar operações exclusivas do administrador e as disponíveis ao colaborador. Explicar bloqueios por edição, vínculo ou dados existentes.
4. Validar a sequência do capítulo com uma edição fictícia nova, sem recorrer a endpoint manual para completar uma etapa.

**Saída:** capítulo completo de preparação. **Aceite:** uma pessoa autorizada consegue preparar dados suficientes para planejar e inscrever sem descobrir pré-requisito oculto no capítulo seguinte.

## M05 — Cronograma e inscrições

1. Redigir `03-agenda-e-inscricoes.md` a partir do estado real da tela: preparar equipes vazias → escolher datas/horas/duração → gerar rascunho → revisar horários/locais e pendências → publicar → definir/abrir janela → encerrar → verificar mínimos → liberar.
2. Explicar o significado de “rascunho”, “publicado”, “previsto”, “aguardando participantes”, “liberado” e “jogo concluído” conforme a UI; diferenciar ato de consultar de ato de gravar.
3. Demonstrar revisão antes da liberação, incluindo encerramento/reabertura da revisão e o que permanece visível aos alunos. Confirmar no código e na UI o bloqueio após a liberação e a recuperação de falhas ou resposta incerta sem repetir mutações às cegas.
4. Trazer os casos de elenco incompleto, modalidade/categoria incompatível, local indisponível, conflitos de horário e janela de inscrições, com mensagens e próximos passos reais.

**Saída:** jornada J02 navegável. **Aceite:** não há recomendação para gerar chaveamento separado nem para abrir inscrições antes de publicar a programação.

## M06 — Operação, offline e disciplina

1. Redigir `04-competicao-e-mesario.md` com acesso ao jogo e controles reais de placar. Separar variantes por tipo de modalidade somente após M01/M02 confirmar as diferenças; cobrir registro/correção de pontos, atleta, ocorrência, resultado e avanço.
2. Explicar consulta de agenda/chaveamento e o que o mesário pode apenas ler. Mostrar como confirmar que um resultado persistiu e apareceu na próxima fase, no histórico e na classificação quando aplicável.
3. Descrever preparo online e operação offline **na mesma aba**; como identificar fila pendente, reconectar, aguardar confirmação e revisar item recusado. Incluir procedimento seguro para não perder operações, sem aconselhar limpeza de dados locais.
4. Verificar o capítulo com um jogo de equipe e uma prova individual, se ambas estão na UI, e com cenário de reconexão no navegador isolado.

**Saída:** procedimentos operacionais e de recuperação. **Aceite:** nenhuma resposta visual provisória é apresentada como sincronização confirmada.

## M07 — Aluno, resultados e problemas comuns

1. Redigir `05-aluno.md` percorrendo J05 com matrícula/senha, primeiros acessos, agenda prevista, escolha de equipe/modalidade, confirmação, até três modalidades, conflito, jogos, ranking e perfil.
2. Redigir `06-resultados-e-consultas.md`: ranking/pódio, pontuação e penalidades quando exibidas, publicação por edição, histórico da turma, arrecadação, ocorrências e indicadores. Explicar filtros e a diferença entre dado previsto e confirmado.
3. Redigir `07-problemas-comuns.md` por sintoma real, sem expor detalhes técnicos ou soluções perigosas. Incluir edição errada, sessão vencida, senha/termos pendentes, ação sem autorização, calendário não publicado, inscrições fechadas, conflito, equipe cheia/mínimo não atendido, falha de rede e sincronização pendente.
4. Ligar cada erro ao procedimento principal e cada procedimento ao erro correspondente. Conferir que o aluno não recebe orientação para usar função administrativa.

**Saída:** capítulos de consulta e recuperação. **Aceite:** J05/J06 cobertos com visibilidade adequada a cada perfil.

## M08 — Revisão cruzada e acessibilidade

1. Aplicar [03-validacao](03-validacao.md) linha por linha. Reproduzir procedimentos do manual em uma edição fictícia, começando apenas pelo índice, sem consultar notas do autor.
2. Fazer leitura com perfis diferentes e comparar cada rótulo, pré-requisito, permissão, resultado e captura à UI atual. Confirmar desktop e celular onde houver diferença; verificar navegação por teclado e texto alternativo.
3. Verificar links/âncoras, referências a arquivos, nomes de imagens, ausência de dados pessoais/segredos e consistência de vocabulário. Corrigir capítulos ou marcar explicitamente uma funcionalidade não verificada.
4. Quando uma instrução falhar, registrar o passo, esperado/observado, versão, tela e evidência. Corrigir o texto se a UI estiver correta; registrar defeito do produto separadamente quando a UI contrariar o contrato.

**Saída:** matriz V01–V18 com evidências e limitações. **Aceite:** todo fluxo principal pode ser seguido por outra pessoa sem conhecimento do código.

## M09 — Fechamento e manutenção

1. Revisar sumário, consistência entre capítulos, versão/data, glossário, capturas e links. Conferir `git diff --check` e diff apenas dos arquivos do manual/plano próprios.
2. Em `STATUS.md`, registrar por etapa: data/fuso, HEAD, ambiente/URL isolada, comandos de verificação, resultados, evidências, pontos não exercidos e próximos passos. Não chamar de homologado o que foi apenas lido no código.
3. Se o manual alterar instruções operacionais do README, atualizar somente a ligação e o resumo necessários, preservando mudanças preexistentes. Seguir regras de stage/commit do AGENTS; não fazer push nem publicar sem solicitação.
4. Entregar caminho do índice e resumo de cobertura por perfil, limitações e como atualizar o manual quando um fluxo mudar.

**Saída:** manual revisável e rastreável. **Aceite:** índice, capítulos, evidências e STATUS concordam com a versão documentada.
