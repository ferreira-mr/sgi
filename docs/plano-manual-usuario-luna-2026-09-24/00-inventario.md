# Inventário de funcionalidades e fluxos a documentar

Este é um **mapa preliminar por inspeção**, não uma homologação de cada botão. O Luna deve completar a matriz `tarefa → perfil → pré-requisito → tela/URL → ação visível → resultado → erro/recuperação → evidência` antes de escrever procedimentos. As URLs abaixo são caminhos da aplicação e podem receber um prefixo de implantação; no manual, orientar pelo nome da tela e usar links relativos quando possível.

## Regras transversais já identificadas

- Há um login canônico em `/login` com matrícula e senha. `/aluno/login` redireciona para ele; não escrever um segundo processo de autenticação para aluno. `LoginController` envia administrador/colaborador a `/edicoes`, mesário a `/painel` e aluno à troca de senha, aos termos ou ao início, conforme o estado.
- O aluno com troca de senha pendente deve concluí-la antes das demais telas. O aceite dos termos vem em seguida. Descrever essa ordem e testar o que acontece ao tentar avançar antes de cada condição.
- Os níveis 0/1/2/3 correspondem a administrador/colaborador/mesário/aluno. O menu não prova permissão; conferir `AccessGuard`, políticas, controladores e respostas HTTP para cada tarefa. O mesário opera na edição ativa.
- Edição, modalidade, categoria, turma, equipe, jogo e ranking têm escopo de edição. O manual deve mostrar como identificar a edição selecionada/ativa e quando mudar de contexto altera o que se vê.
- O cronograma planejado é preparado e publicado **antes** da inscrição. A revisão antes da liberação, o fechamento das inscrições, a liberação e o avanço da chave pertencem à mesma jornada. A tela Chaveamento é de consulta e acompanhamento da árvore publicada; não instruir uma geração inicial paralela.
- Offline do mesário exige login e preparo **com conexão**. Na mesma aba preparada, é possível operar e sincronizar depois; refresh, nova aba e abertura fria sem rede não são fluxos suportados. Não instruir apagar cache/IndexedDB com operações pendentes.

## Cobertura por tela

Legenda: **P** = página presente nas rotas; **C** = ação/condição preliminarmente confirmada por views/rotas/README; **V** = verificar na UI e nos contratos antes de detalhar. Uma página existir não implica que todo perfil pode usá-la.

| ID | Tela/rota (origem) | Tarefas que o manual deve verificar e cobrir | Estado |
| --- | --- | --- | --- |
| A01 | Acesso `/login` (`acesso/login.php`) | Entrar, mensagem de credencial inválida, destino por perfil, sair, sessão expirada | P/C; V mensagens e recuperação |
| A02 | Primeiro acesso `/aluno/trocar-senha` | Criar senha pessoal, erros de validação, volta ao fluxo de termos | P/C; V campos/regras visíveis |
| A03 | Termos `/aluno/termos` | Ler responsabilidade e regulamento, aceitar, bloqueio antes do aceite | P/C; V estados |
| A04 | Perfis `/perfil`, `/aluno/perfil` | Consultar/alterar dados permitidos e foto, salvar/cancelar, limites por perfil | P; V ações e validações |
| A05 | Colaboradores `/colaboradores` | Cadastrar/editar/gerir acesso administrativo e mesário, impacto de alteração de senha/perfil | P; V ações e permissão efetiva |
| E01 | Edições `/edicoes` | Criar, escolher, ativar/encerrar e consultar edição; efeitos no restante da navegação | P; V ações/estados exatos |
| E02 | Painel `/painel` | Selecionar edição, interpretar indicadores, navegar para tarefas e histórico | P; V indicadores por perfil |
| E03 | Resumo `/edicoes/resumo` | Conferir categorias, turmas, modalidades e pontuação antes de concluir configuração | P/C; V fluxo de retorno |
| E04 | Categorias `/categorias`, `/edicoes/categorias` | Criar/editar categoria, vínculo com turmas e limites de alteração | P; V diferenças entre telas |
| E05 | Turmas `/turmas`, `/edicoes/turmas` | Criar/editar/atribuir categoria, consultar lista, filtrar e acessar alunos | P; V diferenças entre telas |
| E06 | Alunos da turma `/turmas/alunos` | Cadastrar/editar aluno, importar PDF quando disponível, consultar vínculos, resolver erros de importação | P; V formato e permissões |
| E07 | Modalidades `/modalidades`, `/edicoes/modalidades`, `/modalidades/detalhes` | Criar/editar, tipo, categoria, entradas por turma, limites de elenco e detalhes | P; V campos e regras atuais |
| E08 | Equipes `/edicoes/equipes`, `/equipes/alunos`, `/equipes/elenco` | Preparar equipes, adicionar/remover/consultar competidores, identificar equipe exata e mínimo de elenco | P; V opções por estado |
| E09 | Locais/regulamento `/edicoes/locais` | Cadastrar/editar locais, disponibilidade e regulamento/termo, vínculo com agenda | P; V upload e leitura |
| E10 | Pontuação `/edicoes/pontuacao` | Configurar valores do pódio e arrecadação, salvar, mudanças não salvas, efeito no ranking | P; V parâmetros reais |
| C01 | Agenda `/edicoes/agenda` | Preparar equipes → gerar rascunho → conferir → publicar → abrir/encerrar inscrições → revisar quando permitido → liberar competição; filtros e ajuste de jogo | P/C; V mensagens, pré-condições e bloqueios |
| C02 | Chaveamento `/chaveamento` | Consultar árvore, fase, confrontos previstos, BYE/avanço, campeão e acesso ao jogo | P/C; V leitura por perfil/edição |
| C03 | Jogos `/jogos`, `/jogos/placar` | Encontrar partida, abrir placar, iniciar/encerrar, registrar/corrigir ponto, atleta, resultado, ocorrências e histórico | P; V ações por modalidade e perfil |
| D01 | Ocorrências `/ocorrencias` | Registrar e consultar ocorrências de aluno/turma, editar/anular se disponível, efeito no ranking | P; V autorização/estados |
| R01 | Arrecadações `/edicoes/arrecadacao` | Registrar/consultar/retirar lançamento, unidade/quantidade e reflexo na pontuação | P; V ações por perfil |
| R02 | Ranking `/ranking`, `/aluno/ranking` | Consultar classificação, filtros, histórico da turma, publicação/visibilidade e destaques quando exibidos | P; V estados por edição/perfil |
| S01 | Início `/aluno/inicio` | Entender resumo, avisos, atalhos e contexto da edição do aluno | P; V conteúdo por estado |
| S02 | Inscrições `/aluno/modalidades` | Ver agenda prevista antes de escolher, selecionar até três modalidades, confirmar equipe e tratar conflito/lotações | P/C; V edição/cancelamento permitido |
| S03 | Jogos `/aluno/jogos` | Consultar agenda, detalhes, horário/local, resultados e estados condicionais | P; V filtros e publicação |

Além dessas páginas, conferir `resources/views/components/admin-nav.php`, `aluno-nav.php`, `resources/js/pages/`, `resources/js/offline/` e os fluxos acessados por modais. Não transformar endpoints técnicos de `/api/v1` em tarefas de usuário se a interface não os oferece.

## Jornadas completas a seguir

1. **J01 — Preparar edição:** login administrativo → criar/ativar edição → conferir categorias, turmas, locais, regulamento, modalidades, regras de pontuação e equipes → revisar resumo.
2. **J02 — Planejar e inscrever:** preparar equipes vazias → gerar/conferir/publicar cronograma → abrir inscrições na janela configurada → aluno vê horários previstos e escolhe → encerrar → resolver elenco insuficiente → liberar competição. Repetir o caminho de revisão pré-liberação e o bloqueio de revisão pós-liberação.
3. **J03 — Operar competição:** mesário entra na edição ativa → abre jogo disponível → registra eventos/placar/ocorrência → confirma resultado → verifica avanço e histórico; administrador/colaborador consultam árvore, agenda, classificação e arrecadação conforme permissão.
4. **J04 — Trabalhar sem rede:** mesário prepara a sessão online → opera na mesma aba sem rede → identifica itens pendentes/erros → reconecta e verifica confirmação, jogo, pontuação e chaveamento; não presumir confirmação por uma resposta inconclusiva.
5. **J05 — Jornada do aluno:** matrícula/senha → senha pessoal, se exigida → termos → início → agenda prevista → inscrição → jogos → ranking/perfil. Cobrir limites de três modalidades, conflitos e indisponibilidade.
6. **J06 — Encerrar e consultar:** edição finalizada ou ranking não publicado, leitura de histórico e diferença entre dados previstos, em andamento e confirmados. Só incluir exportação se a UI atual a oferecer.

## Dúvidas obrigatórias para o levantamento M01

- Quais ações em E01/E04–E10 são exclusivas do administrador e quais o colaborador realmente executa? Conferir servidor e UI separadamente.
- Onde a inclusão/importação de alunos fica acessível no fluxo normal, quais formatos/limites são aceitos e como desfazer erro? Não copiar RF01 de `requisitos.md` sem prova.
- Quais tipos de modalidade usam placar por pontos, sets, resultado manual ou marca individual? Mapear passos e vocabulário de cada variante real.
- Em que estados se pode alterar calendário, jogo, equipe, inscrição, ocorrência, arrecadação e ranking? Registrar o bloqueio e a mensagem.
- Há controle de edição de inscrição pelo aluno, redefinição de senha, exportação ou impressão na UI? Caso ausente, não criar instrução.
- Quais telas o mesário apenas lê e quais modifica? Qual indicador mostra fila pendente, erro e sincronização concluída?
- Quais informações do ranking só aparecem após publicação e como a turma visualiza histórico por edição? Não inferir visibilidade do status da edição.
