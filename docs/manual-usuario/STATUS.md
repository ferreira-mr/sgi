# Cobertura e evidências do manual

**Data da revisão:** 24/09/2026 (America/Sao_Paulo)  
**Código:** `b31afce8d02b8042cee0f5b578b78f29ea8cf5d7`  
**Aplicação:** `http://127.0.0.1:8099/` em projeto Docker Compose descartável `sgi-manual-20260924`; base descartável `sgi_test_manual20260924`.  
**Dados:** conta administrativa e edição fictícias; nenhum dado real foi usado.  
**Capturas:** `imagens/`, PNG, desktop 1440 px e uma tela móvel 390 px. Arquivos revisados visualmente antes de entrar no PDF.

Este registro separa a inspeção das rotas/código da navegação exercitada. Uma linha parcial não representa homologação completa daquele fluxo.

## Etapas do roteiro

| Etapa | Estado | Evidência / limite |
| --- | --- | --- |
| M00 — Baseline | Concluída | HEAD e estado inicial registrados no plano; checkout tinha alterações alheias preexistentes, preservadas. |
| M01 — Inventário | Parcial | Rotas web, navegação, views/JS relevantes, README e instruções do repositório comparados; a matriz V01–V18 abaixo marca os perfis e fluxos que não foram todos percorridos no navegador. |
| M02 — Jornadas reais | Parcial | Edição sintética criada pela UI; lista/resumo, categorias, turmas, modalidades, locais, pontuação, equipes, ranking, ocorrências, arrecadações, perfil e layout móvel consultados. Agenda preparada, rascunho gerado, cronograma publicado e inscrições abertas pela interface. Nenhum aluno, mesário ou resultado de jogo foi criado/operado. |
| M03 — Índice e acesso | Redigida | `README.md` e `01-acesso-e-conta.md`; destino e regras do aluno também conferidos em rotas/menu e README. Login de aluno, troca de senha e aceite não foram navegados. |
| M04 — Administração | Redigida | `02-administrador-edicao.md`; edição criada e telas administrativas capturadas. Cadastro/importação de alunos e colaboradores não foram percorridos até salvar. |
| M05 — Agenda e inscrições | Parcial | `03-agenda-e-inscricoes.md`; UI exercitada até inscrições abertas. Revisão, encerramento, elenco mínimo e liberação não foram exercitados. |
| M06 — Operação e offline | Parcial | `04-competicao-e-mesario.md` comparado às telas/código do placar, fila offline, sincronização e chaveamento. Partida, correção, confirmação de resultado e reconexão offline não foram navegadas. |
| M07 — Aluno, consulta e suporte | Parcial | `05-aluno.md`, `06-resultados-e-consultas.md` e `07-problemas-comuns.md` elaborados a partir das rotas, views/JS e README. A jornada real de aluno e estados publicados/não publicados de ranking não foram exercitados. |
| M08 — Revisão | Parcial | Texto, imagens, índice, alt text, links e todas as 29 páginas do PDF conferidos visualmente em folhas de contato; pendências de jornada descritas abaixo. Não houve leitor independente. |
| M09 — Entrega | Concluída | PDF gerado em `output/pdf/manual-usuario-sgi.pdf`, 29 páginas, tamanho carta, 23 capturas; fontes Markdown e caminhos conferidos. `git diff --check` não apontou erro de whitespace; em arquivos rastreados mostrou somente avisos de normalização CRLF preexistentes. Projeto Compose descartável encerrado com `down --volumes --remove-orphans`. |

## Matriz V01–V18

| ID | Estado | Capítulo | Evidência observada | Limite |
| --- | --- | --- | --- | --- |
| V01 | Parcial | README | Índice e atalhos por perfil/tarefa redigidos; destinos e âncoras conferidos. | Ninguém externo percorreu as tarefas. |
| V02 | Parcial | 01 | Login único observado; conta fictícia autenticou e chegou à administração. | Logout, credencial inválida, sessão expirada e destinos de outros perfis não exercitados. |
| V03 | Parcial | 01, 05 | Ordem senha → termos confirmada em rotas, guards/README e menu. | Fluxo na UI, erros e aceite não percorridos. |
| V04 | Passou | 02 | Edição criada na UI; painel mostra nome e estado ativo. | Seleção entre várias edições não exercitada. |
| V05 | Parcial | 02 | Categorias/turmas observadas; formulários e limite de PDF conferidos na view. | Cadastro individual, importação PDF, erro e correção não executados. |
| V06 | Parcial | 02 | Modalidades, locais/regulamento, pontuação e equipes consultados; modalidade criada na UI. | Upload de regulamento e efeitos de inscrições reais em equipes não exercitados. |
| V07 | Parcial | 01, 02, 04 | Papéis comparados às instruções e guardas/menus da aplicação. | Não foi feita autenticação e comparação por cada perfil. |
| V08 | Passou | 03 | Preparação, rascunho, publicação e abertura observados em navegador. | Eventos do mês da competição e inscrição do aluno não verificados; publicação exercitada. |
| V09 | Parcial | 03 | Controles e pré-condições da revisão comparados ao fluxo documentado/código. | Reabrir revisão e bloqueio pós-liberação não exercitados. |
| V10 | Parcial | 03 | Botão de liberação e fluxo anterior documentados; critérios comparados ao README/serviços. | Encerrar inscrições, mínimos e liberação não exercitados. |
| V11 | Parcial | 05 | Limite de três e verificações de horários consultados no código/README. | Sem conta estudantil; inscrição, conflito e lotação não exercitados. |
| V12 | Parcial | 04 | Controles de placar, pontos, ocorrências e tipos de jogo inspecionados em view/JS. | Sem partida, correção, resultado persistido, avanço ou variante exercitada. |
| V13 | Parcial | 04 | Limites do offline conferidos no AGENTS, README e scripts offline. | Sem desconexão/reconexão em aba preparada nesta execução. |
| V14 | Parcial | 04, 06 | Telas de ocorrências e arrecadações consultadas; regras de pontuação lidas. | Registro de uma ocorrência/arrecadação e efeito no ranking não exercitados. |
| V15 | Parcial | 06 | Ranking sem resultados visualizado; publicação e histórico conferidos em regras/telas. | Estados publicado/não publicado e leitura por aluno não exercitados. |
| V16 | Parcial | 07 | Casos e ações seguras cruzados com validações/mensagens visíveis e contratos. | Nem todos os erros foram induzidos no navegador. |
| V17 | Parcial | Todos | Hierarquia, texto, links, alt text e layout móvel administrativo revisados. | Tela móvel do aluno, leitor de tela e revisão independente não testados. |
| V18 | Parcial | Todos | Figuras sintéticas e data/revisão identificadas; 32 links e 23 imagens conferidos; 29 páginas rasterizadas e inspecionadas; `pdfinfo` confirmou tamanho carta. | O extrator pypdf do runtime substituiu parte dos acentos codificados em WinAnsi, embora a renderização esteja correta. Cópia de texto e leitor de tela não foram verificados. |

## Capturas incluídas

| Arquivo | Tela / estado | Perfil e cenário | Resolução |
| --- | --- | --- | --- |
| `01-login-administracao.png` | Login único, vazio | Visitante; instalação isolada | 1440×900 |
| `02-edicoes-vazia.png` | Lista antes da primeira edição | Administrador sintético | 1440×960 |
| `03-criar-edicao.png` | Formulário de criação sobre edição fictícia | Administrador sintético | 1440×900 |
| `04-painel-administrador.png` | Painel após criação | Administrador sintético | 1440×960 |
| `05-resumo-edicao.png` | Resumo inicial | Administrador sintético | 1440×960 |
| `06-agenda.png` | Agenda antes de planejar | Administrador sintético | 1440×900 |
| `07-categorias.png` | Categorias iniciais | Administrador sintético | 1440×900 |
| `08-turmas.png` | Seleção de categoria/turmas | Administrador sintético | 1440×900 |
| `09-modalidades.png` | Modalidades existentes | Administrador sintético | 1440×900 |
| `10-locais-regulamento.png` | Locais e área de regulamento | Administrador sintético | 1440×900 |
| `11-pontuacao.png` | Valores de demonstração | Administrador sintético | 1440×900 |
| `12-equipes.png` | Equipes/entradas planejadas | Administrador sintético | 1440×900 |
| `13-chaveamento.png` | Sem árvore liberada | Administrador sintético | 1440×900 |
| `14-ranking.png` | Classificação sem resultados | Administrador sintético | 1440×900 |
| `15-ocorrencias.png` | Consulta de ocorrências | Administrador sintético | 1440×900 |
| `16-arrecadacoes.png` | Consulta de arrecadações | Administrador sintético | 1440×900 |
| `17-perfil.png` | Perfil fictício | Administrador sintético | 1440×900 |
| `18-painel-mobile.png` | Painel administrativo responsivo | Administrador sintético | 390×844 |
| `19-rascunho-cronograma.png` | Erro: modalidade sem quantidade planejada; recorte do painel | Administrador sintético | 1440×560 |
| `20-configurar-modalidade.png` | Criação com planejamento antecipado | Administrador sintético | 1440×1000 |
| `21-rascunho-cronograma.png` | Prévia: 4 nós, 3 compromissos, sem pendências; recorte do painel | Administrador sintético | 1440×560 |
| `22-cronograma-publicado.png` | Grade publicada; inscrições fechadas; recorte do painel | Administrador sintético | 1440×560 |
| `23-inscricoes-abertas.png` | Grade publicada; inscrições abertas; recorte do painel | Administrador sintético | 1440×560 |

As capturas 19 e 21–23 foram recortadas para destacar o painel de estado; as demais preservam a tela inteira. Datas e valores são exclusivamente ilustrativos. Nenhuma tela de placar, aluno ou fila offline é apresentada como evidência de execução.

## Achados e limites conhecidos

- A tentativa inicial de gerar rascunho sem quantidade planejada foi recusada pela UI; a captura 19 registra o aviso. O manual orienta conferir as modalidades ativas.
- O formulário de criação de modalidade expõe o planejamento antecipado. A edição de modalidade preexistente não mostrou o campo durante esta revisão; não recomendamos excluir modalidades para corrigir dados já utilizados.
- A semente SQL histórica de demonstração não foi compatível com as enumerações do schema atual e falhou dentro do banco descartável. Não foi usada como evidência nem foi aplicada na base de trabalho; a edição foi criada pela UI e a conta pelo comando administrativo suportado.
- Não foi possível/necessário completar a jornada de aluno, liberação, placar, offline e reconexão nesta revisão. O texto correspondente deve ser lido como orientação baseada em contratos atuais, não como homologação ponta a ponta.

## Verificações da entrega

- `python tmp/pdfs/build_manual.py`: concluiu e gerou o PDF de 2.044.895 bytes.
- `pdfinfo output/pdf/manual-usuario-sgi.pdf`: 29 páginas, 612 × 792 pts (carta).
- `pdftoppm -png -r 100 output/pdf/manual-usuario-sgi.pdf tmp/pdfs/manual-usuario-v3/pagina`: 29 páginas renderizadas e revisadas em cinco folhas de contato.
- Checagem de destinos Markdown e imagens: 32 links e 23 imagens; nenhum destino ausente.
- `git diff --check`: sem erros de whitespace; apenas avisos CRLF em arquivos rastreados previamente alterados.
- `pypdf` confirmou estrutura e títulos, mas sua extração substituiu parte dos acentos codificados em WinAnsi. A rasterização Poppler exibiu os acentos corretamente; cópia de texto/leitor de tela não foi validada.
- Compose project `sgi-manual-20260924` encerrado e volume `sgi-manual-20260924_test_sessions` removido. Os artefatos intermediários criados em `tmp/pdfs/` foram removidos; as fontes, capturas e o PDF final permanecem.
