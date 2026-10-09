# Manual do usuário do SGI

**Sistema de Gestão de Interclasses do SESI**  
**Revisão:** 24 de setembro de 2026  
**Referência do código:** checkout `b31afce8d02b8042cee0f5b578b78f29ea8cf5d7`  
**Público:** administradores, colaboradores, mesários e alunos.

Este manual explica como preparar uma edição, organizar inscrições e jogos, operar partidas e consultar resultados. Os nomes entre aspas correspondem aos controles vistos na interface; a posição pode mudar conforme o tamanho da tela. As telas incluídas foram capturadas com uma edição e uma conta administrativas fictícias em ambiente isolado.

## Comece pela sua tarefa

- [Quero entrar, trocar minha senha ou atualizar meu perfil](01-acesso-e-conta.md).
- [Quero preparar uma edição do Interclasses](02-administrador-edicao.md).
- [Quero gerar o cronograma e abrir as inscrições](03-agenda-e-inscricoes.md).
- [Quero acompanhar ou operar uma partida](04-competicao-e-mesario.md).
- [Quero me inscrever ou consultar meus jogos](05-aluno.md).
- [Quero conferir ranking, arrecadações ou ocorrências](06-resultados-e-consultas.md).
- [Não consigo concluir uma etapa](07-problemas-comuns.md).

## Atalhos por perfil

| Perfil | Para começar |
| --- | --- |
| Administrador | [Criar e configurar uma edição](02-administrador-edicao.md#1-criar-e-escolher-a-edicao), depois [publicar o cronograma](03-agenda-e-inscricoes.md). |
| Colaborador | Entre em [Acesso e conta](01-acesso-e-conta.md#1-entrar-e-sair) e siga as telas que seu acesso permite. A permissão de cada ação é conferida pelo sistema. |
| Mesário | Leia [Operar uma partida](04-competicao-e-mesario.md#1-localizar-o-jogo) e [Trabalhar sem conexão](04-competicao-e-mesario.md#5-trabalhar-sem-conexao). |
| Aluno | Siga a ordem [primeiro acesso](01-acesso-e-conta.md#2-primeiro-acesso-do-aluno), [inscrição](05-aluno.md#2-escolher-modalidades) e [consulta de jogos](05-aluno.md#3-consultar-jogos-e-resultados). |

## Caminho principal de uma edição

1. O administrador cria a edição e confere categorias, turmas, alunos, modalidades, locais, regulamento, equipes e pontuação.
2. Na Agenda, configura período e horários, prepara as equipes, gera o rascunho e revisa a grade.
3. Publica o cronograma e abre a janela de inscrições.
4. Os alunos consultam os confrontos previstos e escolhem até três modalidades disponíveis.
5. A administração encerra as inscrições, resolve elencos incompletos e libera a competição.
6. O mesário registra as partidas; o resultado confirmado avança a competição conforme a árvore publicada.
7. Administração, colaboradores e alunos consultam as informações que seu perfil e a publicação da edição permitem ver.

> A tela **Chaveamento** acompanha a árvore criada pelo cronograma. Não use uma geração paralela de chave: publique o cronograma e use **Liberar competição** na Agenda.

## Sumário

1. [Acesso e conta](01-acesso-e-conta.md)
2. [Administrador: preparar a edição](02-administrador-edicao.md)
3. [Agenda e inscrições](03-agenda-e-inscricoes.md)
4. [Competição e mesário](04-competicao-e-mesario.md)
5. [Aluno](05-aluno.md)
6. [Resultados e consultas](06-resultados-e-consultas.md)
7. [Problemas comuns](07-problemas-comuns.md)

## Termos usados

- **Edição:** uma realização do Interclasses, normalmente referente a um ano. Os dados e resultados pertencem a uma edição.
- **Categoria:** agrupamento usado para organizar turmas na edição.
- **Turma:** grupo escolar ao qual alunos e equipes são vinculados.
- **Modalidade:** atividade esportiva ou prova disponível para inscrição.
- **Equipe:** inscrição competitiva de uma turma em uma modalidade; uma turma pode ter mais de uma equipe quando o planejamento permitir.
- **Cronograma:** datas, horários e locais previstos para os confrontos.
- **Partida:** disputa concreta entre participantes dentro de um jogo.
- **Chaveamento:** árvore que mostra as fases, confrontos e avanços da competição.
- **Ranking:** classificação calculada a partir dos resultados e demais pontuações da edição.
- **Rascunho:** grade ainda em revisão. Publicar e abrir inscrições são ações separadas.

## Sobre esta revisão

O fluxo administrativo foi percorrido em navegador com dados fictícios até a publicação do cronograma e a abertura das inscrições. As demais instruções foram conferidas nas rotas, telas, scripts, serviços e documentos operacionais atuais. A operação de uma partida, o login de aluno e a reconexão offline não foram exercitados nesta revisão; o registro de cobertura do pacote distingue essa evidência. Reconfira as telas se a instalação tiver versão ou configuração diferente.

## Pedir ajuda

Ao pedir suporte, informe seu perfil, o nome/ano da edição, a tela, a ação tentada e a mensagem exibida. Não envie sua senha, código de sessão ou captura que exponha dados de outros alunos. Para uma fila offline pendente, mantenha a mesma aba aberta e peça suporte antes de limpar dados do navegador.
