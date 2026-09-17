# Plano e Diretrizes de Design System do SGI

Este documento estabelece o diagnóstico de maturidade visual, o inventário de problemas de interface e o plano de evolução de UI/UX para o **Sistema de Gestão de Interclasses (SGI)**. O objetivo é transformar o SGI em uma aplicação web/PWA com acabamento visual e ergonomia operacional comparáveis aos principais produtos digitais de esporte e produtividade da atualidade (como *Sofascore*, *Flashscore*, diretrizes de *Material Design 3* e *Apple Human Interface Guidelines*), mantendo fidelidade estrita às regras arquiteturais de `AGENTS.md`.

---

## 1. Visão Geral e Princípios de Design do SGI

### 1.1 Contexto e Desafios de Interface
O SGI atende a quatro perfis com necessidades ergonômicas muito distintas:
1. **Administrador (`nível 0`):** Operação densa, gestão de dados em lote (PDF, turmas, modalidades, chaveamentos), configuração de parâmetros e monitoramento geral.
2. **Colaborador (`nível 1`):** Apoio logístico, cadastro de resultados preliminares e acompanhamento de turmas.
3. **Mesário (`nível 2`):** Operação em campo à beira de quadra, em smartphones/tablets, com frequência sob luz solar direta, rede instável ou 100% offline (IndexedDB local), exigindo zonas de toque amplas (mínimo de 48×48 px), alto contraste e zero ambiguidade.
4. **Aluno (`nível 3`):** Experiência nativa PWA em smartphones pessoais, acompanhamento de partidas da sua turma, quadro de medalhas, termos de adesão e consulta rápida de pontuação.

### 1.2 Pilares do Design System
* **Identidade SESI Esportiva & Semântica de Cores:**
  * Vermelho SESI (`#E30613` e variantes `#C50510` para hover e `#FFEBEC` para fundos suaves) como cor mestra de marca.
  * Eliminação do azul primário genérico do Bootstrap (`#0d6efd`) em botões de ação principal administrativa e mesário, unificando botões de ação na paleta institucional ou neutra dark (`#1E293B`).
  * Semântica esportiva funcional: Ouro metálico (`#FFD700`), Prata (`#C0C0C0`), Bronze (`#CD7F32`), Verde de vitória/concluído (`#16A34A`), Amarelo de atenção/cartão (`#EAB308`) e Vermelho disciplinar (`#DC2626`).
* **Ergonomia Operacional (Thumb Zone & Touch Targets):**
  * Toda ação crítica (botão de ponto `+` / `-`, início de cronômetro, salvar ocorrência) deve ter área de toque mínima de **48×48 px** com margens de separação que impeçam toques acidentais em dispositivos móveis.
* **Consistência de Estados (Loading, Empty, Error, Offline):**
  * Substituição de textos genéricos como `<p>Carregando...</p>` por *Skeleton Loaders* com animação suave (`placeholder-wave`/`placeholder-glow`).
  * Empty states humanizados com ilustrações ou ícones semânticos com mensagens de orientação acionáveis.
  * Feedback imediato de sincronização offline através de pill badges discretos no topo (`Sincronizado`, `Pendente`, `Offline`).
* **Acessibilidade e Microanimações:**
  * Conformidade estrita com **WCAG 2.1 AA/AAA** para contraste de cores em fundos escuros e badges.
  * Todas as transições (elevação de card, pulso de cronômetro, transição de tabs) devem respeitar `@media (prefers-reduced-motion: reduce)`.

---

## 2. Melhorias Recentes Implementadas e Validadas (Fase 1)

Durante a primeira etapa de modernização, foram solucionados gargalos críticos de layout e identidade visual identificados pelo usuário:

### 2.1 Sidebar Rail (Navegação Lateral Desktop)
* **Problema Anterior:** A barra lateral compacta (sidebar rail) possuía largura de apenas `5rem` (80px), fazendo com que itens como "Classificação" quebrassem em "Classific" / "ação", comprometendo a legibilidade e a estética profissional.
* **Ajustes Realizados:**
  * Calibração da variável `--sgi-sidebar-width` de `5rem` para `5.75rem` (92px).
  * Redução do padding horizontal interno de `.sidebar-nav .nav-item` para `.375rem`.
  * Aplicação de `white-space: nowrap; overflow: hidden; text-overflow: ellipsis;` na classe `.sgi-sidebar-label`.
* **Resultado:** Rótulos como "Classificação", "Modalidades" e "Colaboradores" agora permanecem perfeitamente centralizados e em linha única, sem truncamento nem quebra antiestética.

### 2.2 Placar / Match Center (Súmula Digital do Mesário)
* **Problema Anterior:** Os dígitos do placar iniciavam com zero duplo formatado (`00`), causando quebra vertical onde um zero ficava em cima do outro em telas móveis compactas.
* **Ajustes Realizados:**
  * Eliminação do `.padStart(2, '0')` inicial em `resources/js/pages/competicoes/placar.js`, exibindo o dígito único natural `0` nas pontuações de 0 a 9.
  * Inclusão de `flex-nowrap` no container `.mc-score-row` e `white-space: nowrap !important;` na classe `.mc-score` em `resources/css/source/admin.css`.
  * Garantia de alinhamento horizontal inquebrável: `[-] 0 [+]  VS  [-] 0 [+]`.
* **Resultado:** O mesário ganha precisão operacional imediata sem deformação do bloco de pontuação, mesmo em smartphones com telas de 360 px a 390 px.

### 2.3 Pódio Gamificado e Badges de Classificação
* **Problema Anterior:** A lista de ranking de turmas exibia círculos pretos planos com números simples (`1`, `2`, `3`) e emojis nativos flutuantes que variavam de renderização conforme a versão do sistema operacional e do navegador.
* **Ajustes Realizados:**
  * Criação das classes de design system `.sgi-podium-badge`, `.sgi-podium-1`, `.sgi-podium-2` e `.sgi-podium-3` em `resources/scss/shared.scss`.
  * Aplicação de gradientes metálicos refinados (Ouro com reflexo suave `linear-gradient(135deg, #FFE066 0%, #D4AF37 100%)`, Prata polida `linear-gradient(135deg, #F5F7FA 0%, #B8C2CC 100%)` e Bronze escovado `linear-gradient(135deg, #EDC9AF 0%, #A05A2C 100%)`).
  * Inclusão de ícones SVG nítidos de Troféu (1º) e Medalha com Laço (2º e 3º) com contraste testado (WCAG AA).
  * Efeito de elevação sutil em hover nos cards (`.card-turma:hover { transform: translateY(-2px); }`) com desativação automática para usuários com preferência de movimento reduzido (`@media (prefers-reduced-motion: reduce)`).
* **Validação:** Criação da suíte de teste automatizado `tests/javascript/ranking-design-system.test.cjs`, aprovada integralmente junto com os 114 testes do repositório.

---

## 3. Avaliação e Diagnóstico Completo: Telas do Mesário

O perfil de Mesário (`nível_usuario = 2`) requer foco absoluto em **ergonomia, velocidade, contraste e resiliência offline**.

### 3.1 Dashboard do Mesário (`resources/views/pages/eventos/dashboard.php`)
* **Estado Atual:** Apresenta 3 cards de navegação rápida: *AGENDA*, *CHAVEAMENTOS* e *OCORRÊNCIAS*.
* **Pontos de Atenção / Inconsistências:**
  * *Mobile:* Os cards ocupam largura total mas não possuem indicação de ação clara (falta chevron `bi-chevron-right` à direita), reduzindo a percepção de que são cartões clicáveis.
  * *Banner Offline:* Ao ficar sem rede, o alerta de status offline no topo comprime o cabeçalho e reduz o espaço vertical visível em telas pequenas.
  * *Cards vazios de contexto:* Falta um card ou sumário de "Jogos Atribuídos a Mim Hoje" diretamente no dashboard, forçando o mesário a navegar na agenda completa para achar seu jogo.
* **Recomendações de Design System:**
  1. Adicionar um micro-card de destaque superior: **"Próxima Partida na Minha Quadra"** com horário, local e botão direto "Abrir Súmula".
  2. Adicionar indicador de seta interativa (`bi-chevron-right text-body-tertiary`) no canto direito de cada card.
  3. Badge persistente de estado offline no topo direito em formato pill compacto (`bi-wifi-off` / `Offline (3 pendentes)`), evitando empurrar o layout.
* **Prioridade:** **Alta** (Uso operacional direto em campo).

### 3.2 Lista de Jogos (`resources/views/pages/competicoes/jogos.php` e `.js`)
* **Estado Atual:** Grade de cartões de jogos com status (`Agendado`, `Iniciado`, `Concluido`), data, horário e local.
* **Pontos de Atenção:**
  * *Estado de Carregamento:* Apresenta apenas texto estático centralizado com spinner pequeno: `Carregando jogos...`.
  * *Hierarquia dos Times:* Os nomes das equipes aparecem como texto simples em uma única linha (`small text-muted`), dificultando a leitura rápida à distância.
  * *Ausência de Filtro de Quadra/Local:* Se um interclasse tiver 4 quadras simultâneas, o mesário precisa rolar todos os jogos da edição para encontrar os da sua quadra.
* **Recomendações de Design System:**
  1. **Match Card no padrão esportivo:** Exibir cada equipe em sua própria linha horizontal com avatar/cor da turma e placar atual ao lado (ex: layout Sofascore/Flashscore).
  2. **Skeleton Screen:** Inserir 4 cards placeholder piscantes durante a requisição à API, eliminando saltos de layout (*Layout Shifts*).
  3. **Chips de Filtro Rápido:** Inserir barra de chips horizontais com scroll: `Todas as Quadras`, `Quadra 1`, `Ginásio Principal`, `Campo de Futebol`.
* **Prioridade:** **Alta**.

### 3.3 Placar / Match Center (`resources/views/pages/competicoes/placar.php` e `.js`)
* **Estado Atual:** Tela central de súmula digital com cronômetro, placar interativo com botões `+` e `-`, atalho para ocorrências e destaques da partida.
* **Pontos de Atenção:**
  * *Diferenciação de Equipes:* Os botões de ponto `+` e `-` usam classes neutras/iguais para ambos os times. Em momentos de jogo rápido, o mesário pode pontuar o time errado por engano.
  * *Botão FAB de Nova Ocorrência:* O botão flutuante `+` no canto inferior direito (`.mc-fab`) possui cor primária azul e pode sobrepor o rodapé da timeline se a lista for longa.
  * *Modais de Ocorrência e Artilharia:* Os campos de seleção de alunos e turmas abrem em formulários convencionais de dropdown pequeno, o que é difícil de operar com uma mão só em smartphones.
* **Recomendações de Design System:**
  1. **Acentos Cromáticos por Equipe:** Permitir que o card da Equipe A receba um toque sutil de cor de destaque (ex: borda superior com a cor da turma) para evitar qualquer erro de clique.
  2. **Microinteração Háptica / Visual de Ponto:** Ao clicar em `+`, disparar animação de escala suave (`transform: scale(1.15)`) no número do placar e feedback de vibração no celular (`navigator.vibrate(50)`).
  3. **Bottom Sheet no Mobile:** Transformar os modais de Cartão/Ocorrência e Ponto Individual em *Bottom Sheets* nativos que sobem do rodapé, facilitando a seleção com o polegar.
* **Prioridade:** **Crítica** (Coração da operação do evento).

### 3.4 Ocorrências e Disciplina (`resources/views/pages/disciplina/ocorrencias.php`)
* **Estado Atual:** Apresenta lista de turmas para registro de cartões amarelos, vermelhos e penalidades em pontos.
* **Pontos de Atenção:**
  * *Duplicação de `<main>`:* Possui dois elementos `<main>` separados no DOM (`d-md-none` e `d-none d-md-block`), o que viola boas práticas de acessibilidade semântica.
  * *Botão Voltar Fora do Padrão:* Utiliza classe `btn-primary` (azul forte) com ícone `bi-arrow-left-circle` desalinhado da identidade SESI.
  * *Feedback de Cartões:* O modal de aplicação de cartões possui botões de rádio pequenos para selecionar "Amarelo", "Vermelho" ou "Suspensão".
* **Recomendações de Design System:**
  1. Unificar a marcação em um único `<main>` com classes responsivas do Bootstrap.
  2. Substituir os radios tradicionais por **Cartões Selecionáveis Grandes (Segmented Controls)**: Card visual Amarelo, Card visual Vermelho e Card visual Suspensão com toque tátil imediato.
  3. Inserir badge do total de pontos já descontados no topo de cada turma em vermelho de alerta (`#DC2626`).
* **Prioridade:** **Média**.

---

## 4. Avaliação e Diagnóstico Completo: Telas Administrativas

As telas administrativas (`nível_usuario = 0 e 1`) são utilizadas para governança de longo prazo e exigem **densidade de informação, eficiência de fluxo, tabelas legíveis e clareza de dados**.

### 4.1 Gestão de Edições (`resources/views/pages/eventos/lista.php`)
* **Estado Atual:** Lista de edições com nome, ano e status (Ativo / Inativo), com modal de criação de nova edição.
* **Pontos de Atenção:**
  * *Cabeçalho da Tabela Estilizado com Vermelho Sólido:* A linha de cabeçalho desktop usa `bg-danger text-white py-3 fs-5 rounded-3 shadow`, gerando um bloco vermelho muito pesado que destoa dos padrões contemporâneos de dashboard corporativo.
  * *Inconsistência de Botões:* Em mobile o botão de criar edição é `btn-primary` (azul), enquanto no desktop é `btn-outline-danger` (vermelho).
  * *ID de Modal Genérico:* O modal utiliza `id="exampleModal"`, remanescente de exemplo inicial do Bootstrap.
* **Recomendações de Design System:**
  1. Adotar cabeçalho de tabela refinado: fundo neutro suave (`bg-body-secondary` ou `bg-light`), bordas sutis (`border-bottom`), texto em caixa alta discreta (`text-body-secondary text-uppercase fw-semibold fs-7`).
  2. Badges de Status Modernos: Em vez de badges planos, usar pills com indicador de ponto pulsante (Pill verde com dot para "Edição Ativa", Pill cinza para "Concluída", Pill amarelo para "Planejamento").
  3. Renomear modal para `modalCriarEdicao` e padronizar o botão em `btn-danger fw-semibold` em todos os breakpoints.
* **Prioridade:** **Alta**.

### 4.2 Dashboard Administrativo (`resources/views/pages/eventos/dashboard.php`)
* **Estado Atual:** Grade de 9 a 11 cartões de acesso a módulos (Modalidades, Pontuações, Locais, Agenda, Arrecadações, Ocorrências, Categorias, Colaboradores, Turmas, Equipes, Chaveamento, Ranking).
* **Pontos de Atenção:**
  * *Monotonia Visual dos Ícones:* Todos os cartões utilizam o mesmo estilo de ícone: quadrado com `bg-danger-subtle text-danger`. Quando a tela possui 11 cartões com o mesmo tom de vermelho, o usuário tem dificuldade de escanear visualmente os módulos.
  * *Cards com Alturas Desiguais:* Textos explicativos com quantidades diferentes de palavras causam pequenas variações de alinhamento vertical.
  * *Falta de Métricas Rápidas (KPIs):* O dashboard é apenas um menu de atalhos. Não exibe contadores em tempo real (ex: "48 Jogos Restantes", "1.250 kg Arrecadados", "85% Termos Assinados").
* **Recomendações de Design System:**
  1. **Diferenciação Cromática Semântica dos Ícones dos Módulos:**
     * Esportivo/Jogos (*Agenda*, *Chaveamento*, *Modalidades*): Ícones com tom esmeralda/azul esporte.
     * Administrativo (*Colaboradores*, *Locais*, *Turmas*): Tons neutros/índigo.
     * Gamificação (*Ranking*, *Pontuações*, *Arrecadação*): Dourado/Âmbar.
     * Disciplinar (*Ocorrências*): Vermelho vibrante.
  2. **Barra Superior de KPIs (Quick Metrics):** Inserir 4 cards de métricas no topo antes da grade de navegação.
  3. **Hover Lift com Transição:** Padronizar `.card-dashboard` com elevação de 3px, sombra suave e borda sutil ao passar o cursor.
* **Prioridade:** **Alta**.

### 4.3 Gestão de Colaboradores e Usuários (`resources/views/pages/acesso/colaboradores.php`)
* **Estado Atual:** Cards de contadores (Total de Usuários, Admins, Mesários, Colaboradores), campo de pesquisa, filtros por perfil e lista de usuários.
* **Pontos de Atenção:**
  * *Duplicação de Código Mobile/Desktop:* O arquivo possui blocos inteiros duplicados (`statsMobile` vs `statsDesktop`, `filtrosMob` vs `filtrosDesk`, `listaColaboradoresMobile` vs `listaColaboradoresDesktop`), aumentando a complexidade de manutenção.
  * *Botões Azuis Bootstrap:* Vários botões de ação e pesquisa utilizam o azul nativo `btn-primary`.
  * *Segurança de Senha Visual:* O modal de cadastro de colaborador não possui medidor visual de força de senha ou toggle para exibir/ocultar senha digitada.
* **Recomendações de Design System:**
  1. Unificar o layout em componentes responsivos únicos (`row row-cols-2 row-cols-lg-4` para estatísticas).
  2. Inserir botão de revelação de senha (`bi-eye` / `bi-eye-slash`) nos campos de senha.
  3. Adicionar tags visuais de status da conta (ex: indicador verde "Último acesso hoje", cinza "Sem acesso recente").
* **Prioridade:** **Média**.

### 4.4 Perfil do Usuário (`resources/views/pages/acesso/perfil.php` e `aluno/perfil.php`)
* **Estado Atual:** Exibição de foto de perfil, matrícula, cargo/perfil de acesso e botões para trocar foto e alterar senha.
* **Pontos de Atenção:**
  * *Borda do Avatar:* A classe `.perfil-avatar-ring` utiliza fundo `bg-primary` (azul) que entra em conflito direto com o tema geral do SESI.
  * *Área de Upload:* O botão de câmera para troca de foto fica em posição absoluta sem contorno de foco acessível evidente via teclado.
* **Recomendações de Design System:**
  1. Anel de avatar refinado com borda em vermelho SESI ou cinza escovado e sombra com difusão suave.
  2. Dialog modal para corte/redimensionamento simples de imagem antes do envio (evitando fotos distorcidas).
  3. Alinhamento de cartões de informações em estilo *Card List* moderno do iOS / Material 3.
* **Prioridade:** **Média**.

### 4.5 Modalidades e Detalhes (`resources/views/pages/competicoes/modalidades.php` e `modalidade-detalhes.php`)
* **Estado Atual:** Cards de modalidades esportivas com gênero (Masc, Fem, Misto), quantidade de inscritos e botão de adicionar modalidade.
* **Pontos de Atenção:**
  * *Borda Azul no Card de Detalhes:* Em `modalidade-detalhes.php`, a div principal possui `border-top border-4 border-primary`, gerando uma linha azul que destoa do tema.
  * *Falta de Identificação Visual do Esporte:* As modalidades são representadas puramente por texto; não há ícone temático de esporte (Futebol, Vôlei, Basquete, Xadrez, Atletismo).
  * *Capacidade de Equipes Pouco Evidente:* Não fica claro de relance quantas turmas já completaram a inscrição e quantas vagas ainda restam.
* **Recomendações de Design System:**
  1. **Mapeamento Automático de Ícones Esportivos:** Atribuir ícones dinâmicos de esportes baseados no nome da modalidade (ex: `bi-dribbble` para basquete, `fa-volleyball` para vôlei, etc.).
  2. **Barra de Progresso de Lotação:** Inserir barra de capacidade tipo "6 de 8 equipes inscritas" com preenchimento em verde/amarelo.
  3. Padronizar a borda superior do card com a cor tema do SGI.
* **Prioridade:** **Média**.

### 4.6 Chaveamento Mata-Mata e Torneios (`resources/views/pages/competicoes/chaveamento.php`)
* **Estado Atual:** Visualizador e gerador de árvores eliminatórias (bracket de torneios) e confrontos de modalidades individuais.
* **Pontos de Atenção:**
  * *Mensagem com Erro de Digitação:* No alerta de aviso consta `⚠️ Não há possibilidade de gerar um segundo chaveamento.Tome cuidado!` (falta espaço após o ponto final).
  * *Scroll Horizontal no Mobile:* Em dispositivos móveis, a árvore de confrontos exige rolagem horizontal longa, mas o container não possui indicador visual de rolagem (*scroll shadow* ou indicador "deslize para ver as finais").
  * *Conexões da Árvore:* As linhas que conectam as partidas (quartas, semifinais e final) em telas menores podem quebrar em viewports intermediários (768 px a 992 px).
* **Recomendações de Design System:**
  1. **Visualizador de Bracket Interativo Estilo Torneio:** Adicionar mini-mapa ou abas de fases superiores (`Oitavas`, `Quartas`, `Semifinal`, `Final`) para navegação direta sem exigir rolagem contínua.
  2. **Card de Partida Esportivo:** Destacar o vencedor de cada confronto com fundo verde sutil e texto em negrito, com badge de placar nítido à direita.
  3. Corrigir a tipografia da mensagem de aviso, transformando-a em um callout informativo elegante com ícone de escudo protetor.
* **Prioridade:** **Alta**.

### 4.7 Elenco e Alunos da Equipe (`resources/views/pages/competicoes/elenco-equipe.php` e `equipe-alunos.php`)
* **Estado Atual:** Listagem e atribuição de alunos matriculados para as equipes de cada modalidade.
* **Pontos de Atenção:**
  * *Seleção em Massa Pouco Ágil:* O processo de selecionar múltiplos alunos em listas longas carece de atalhos rápidos como "Selecionar Todos da Turma" ou filtro instantâneo por gênero.
  * *Falta de Indicação de Termo:* Não sinaliza de forma evidente se o aluno já teve o termo de participação assinado pelo responsável.
* **Recomendações de Design System:**
  1. Adicionar chip com status do termo ao lado de cada aluno: `Termo OK` (verde) ou `Termo Pendente` (âmbar).
  2. Barra fixa inferior flutuante com contador dinâmico de atletas selecionados e botão "Salvar Elenco".
* **Prioridade:** **Média**.

### 4.8 Turmas e Importação de Alunos (`resources/views/pages/participantes/turmas.php` e `turma-alunos.php`)
* **Estado Atual:** Gestão de turmas divididas por ano/categoria, com ferramenta de importação de PDF de alunos matriculados.
* **Pontos de Atenção:**
  * *Posicionamento Fixo do Botão Criar Turma:* Em `turmas.php`, o botão móvel utiliza a classe utilitária legada `sgi-u-h-60px-w-60px-bottom-100px`, posicionando o botão a exatamente 100px do fundo de forma rígida, o que pode conflitar com barras de navegação de diferentes navegadores móveis.
  * *Área de Dropzone do PDF:* O dropzone de importação de PDF é muito básico e a mensagem de erro quando o PDF não contém texto selecionável pode assustar o usuário administrativo.
* **Recomendações de Design System:**
  1. Reestruturar a dropzone de PDF com visual moderno: contorno pontilhado suave, ícone animado de nuvem, suporte a arrastar e soltar (drag & drop) com feedback visual de arrasto ativo (`border-danger bg-danger-subtle`).
  2. Substituição do posicionamento rígido do FAB móvel por utilitários flexíveis com suporte a `env(safe-area-inset-bottom)`.
  3. Exibição de tabela de prévia dos alunos reconhecidos no PDF antes da confirmação de gravação no banco de dados.
* **Prioridade:** **Alta**.

### 4.9 Ranking e Classificação Geral (`resources/views/pages/resultados/ranking.php`)
* **Estado Atual:** Tabela de classificação geral de pontuações por categoria, com botão de impressão.
* **Pontos de Atenção:**
  * *Emojis Unicode Brutos:* Utiliza `&#x1F465;` em HTML puro para o ícone de total de turmas.
  * *Falta de Estilo de Impressão Dedicado:* O botão `window.print()` não possui uma folha de estilo de impressão otimizada (`@media print`), gerando quebra de páginas com botões e menus impressos sem necessidade.
* **Recomendações de Design System:**
  1. Utilizar os novos badges de pódio metálicos (`.sgi-podium-badge`) também na visão administrativa para manter coerência com o portal do aluno.
  2. Folha de estilo `@media print` dedicada: remover navbar, sidebar e botões na impressão, exibindo apenas o cabeçalho institucional oficial do SESI, a data da emissão e a tabela de pontuação com listras pretas/brancas de alta economia de tinta.
  3. Chips de filtro de categoria com badges de quantidade de turmas ativas.
* **Prioridade:** **Média**.

---

## 5. Avaliação do Wizard de Configuração de Edições (Passos 1 a 9)

O assistente de criação de novas edições (`eventos/configurar-*.php`) orienta o administrador pelos passos necessários para iniciar o interclasse:

| Passo | Tela | Função | Avaliação de UI/UX & Oportunidades |
| :---: | :--- | :--- | :--- |
| **01** | `configurar-categorias.php` | Definição de Ensino Fundamental, Médio, etc. | Formulário limpo, mas a navegação entre passos não tem indicador visual de progresso (ex: "Passo 1 de 9"). |
| **02** | `configurar-turmas.php` | Cadastro de turmas por categoria | Falta exibição de total de turmas já cadastradas em badges de contagem rápida. |
| **03** | `configurar-modalidades.php` | Escolha dos esportes da edição | A toolbar de filtros sofre overflow em telas de 320 px a 390 px. Necessita de scroll horizontal com scrollbar oculta. |
| **04** | `configurar-equipes.php` | Composição e limites de atletas | O botão de confirmação precisa de indicador de capacidade máxima respeitada. |
| **05** | `configurar-locais.php` | Cadastro de quadras e ginásios | O modal de novo local pode conter ícones temáticos de quadras para enriquecer a lista visual. |
| **06** | `configurar-agenda.php` | Montagem do calendário de partidas | **Excelente calendário**, porém os botões de avançar e retroceder mês precisam de maior contraste no tema escuro. O agendador automático em lote requer modal de confirmação com barra de progresso. |
| **07** | `configurar-pontuacao.php` | Pontos para 1º, 2º, 3º lugar e arrecadação | Os cartões de Ouro, Prata e Bronze já utilizam cores temáticas, mas podem adotar os mesmos tokens metálicos de gradiente do pódio da Fase 1 para unificação estética. |
| **08** | `configurar-arrecadacao.php` | Metas de kg de alimentos por turma | Falta máscara de unidade de medida (`kg`) automática no campo de input. |
| **09** | `configurar-resumo.php` | Ativação da edição e conferência final | Utiliza botões cinzas simples para representar as etapas. Deve adotar um **Stepper Visual Conectado** com linhas horizontais e ícones de "Check" verde nas etapas já completadas. |

---

## 6. Avaliação do Portal do Aluno (PWA) e Telas de Autenticação

Para os alunos, a aplicação deve se comportar como um **app nativo de smartphone**.

### 6.1 Tela de Login (`resources/views/pages/acesso/login.php`)
* **Desktop:** Layout em tela dividida (*split screen*) com foto esportiva à esquerda e formulário à direita. Funciona bem, mas a foto possui corte seco sem transição suave.
* **Mobile:** O banner vermelho do topo ocupa quase 40% da altura da viewport, forçando o teclado virtual a cobrir os campos de login e botão de envio ao focar no input.
* **Solução Recomendada:** Reduzir o banner mobile para uma barra elegante de 80 px com logotipo do SESI e slogan centralizado, garantindo que os inputs e o botão "Entrar" fiquem 100% visíveis acima da linha de dobra do teclado.

### 6.2 Home do Aluno (`resources/views/pages/aluno/home.php`)
* **Desktop:** O hero card vermelho superior estende-se por toda a largura, mas o texto informativo ocupa apenas os 30% da esquerda, deixando um grande vazio vermelho à direita.
* **Mobile:** O botão sanduíche de menu pode sobrepor o canto superior do card vermelho de boas-vindas.
* **Solução Recomendada:** Inserir no lado direito do hero card do aluno uma ilustração estilizada de troféu ou widget de resumo ("Sua Turma: 3º B Médio • 2 vitórias • 45 pts"). Garantir margem superior de segurança de 16 px abaixo da navbar móvel.

### 6.3 Jogos do Aluno (`resources/views/pages/aluno/jogos.php`)
* **Redundância:** O card do jogo exibe a badge `3º A MÉDIO` e o texto logo abaixo repete `3º A Médio`.
* **Solução Recomendada:** Remover o texto duplicado e substituir o separador `- X -` por uma badge atlética circular com tipografia `VS` estilizada e placar em destaque.

### 6.4 Termos de Participação (`resources/views/pages/aluno/termos.php`)
* **Usabilidade:** A confirmação de aceite de termos deve ter feedback visual indiscutível com selo digital verde (`Termo Aceito em DD/MM/AAAA às HH:MM`) e opção de download de comprovante em PDF.

---

## 7. Matriz de Priorização e Plano de Execução

A tabela a seguir consolida as oportunidades de melhoria por nível de prioridade e impacto visual:

| Código | Módulo / Tela | Melhoria Proposta | Impacto | Prioridade |
| :---: | :--- | :--- | :---: | :---: |
| **DS-01** | `competicoes/placar.php` | Bottom sheet de cartões/ocorrências, microinteração tátil e acento de cor por equipe no placar. | Crítico | **Alta** |
| **DS-02** | `eventos/lista.php` | Substituição do cabeçalho vermelho pesado por tabela moderna com pills de status com dot animado. | Alto | **Alta** |
| **DS-03** | `eventos/dashboard.php` | Diferenciação cromática dos ícones dos 11 módulos e inserção de cards de métricas (KPIs). | Alto | **Alta** |
| **DS-04** | `acesso/login.php` | Redimensionamento do hero mobile para evitar obstrução de teclado e alinhamento visual do split desktop. | Alto | **Alta** |
| **DS-05** | `competicoes/jogos.php` | Skeleton loaders para carregamento de partidas e layout Sofascore nos cards de equipes. | Médio | **Média** |
| **DS-06** | `configurar-resumo.php` | Componente de Stepper visual conectado substituindo botões cinzas comuns. | Médio | **Média** |
| **DS-07** | `participantes/turma-alunos.php` | Dropzone com drag-and-drop moderno e feedback visual para importação de PDF. | Médio | **Média** |
| **DS-08** | `resultados/ranking.php` | Estilização `@media print` para relatórios oficiais limpos e remoção de emojis brutos no HTML. | Médio | **Média** |
| **DS-09** | `competicoes/chaveamento.php` | Navegação por abas de fases eliminatórias no mobile e correção da tipografia de alertas. | Médio | **Média** |
| **DS-10** | `acesso/colaboradores.php` | Unificação de marcação mobile/desktop, eliminação de IDs duplicados e indicador de força de senha. | Baixo | **Baixa** |

---

## 8. Diretrizes para Futuras Implementações

Ao implementar qualquer uma das melhorias acima, os desenvolvedores e agentes devem seguir os seguintes padrões:
1. **Nunca inserir CSS inline em arquivos PHP ou JavaScript:** Toda nova regra deve residir em `resources/scss/shared.scss` ou na folha fonte correspondente em `resources/css/source/` (compilada com `npm run build`).
2. **Preservar a Paleta de Cores Semântica:** Utilizar as variáveis SCSS e tokens já padronizados (`--sgi-primary-red`, `--sgi-podium-gold`, `--sgi-neutral-*`).
3. **Respeitar Acessibilidade e Redução de Movimento:** Toda animação ou microinteração deve estar contida ou anulada sob a media query `@media (prefers-reduced-motion: reduce)`.
4. **Executar a Suíte Completa de Testes:** Antes de qualquer entrega ou commit, validar com `npm test` e `powershell -ExecutionPolicy Bypass -File tools/test-local.ps1 -Suite quality`.
