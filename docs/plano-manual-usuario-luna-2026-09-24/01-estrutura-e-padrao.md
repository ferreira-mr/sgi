# Estrutura do manual e padrão editorial

## Arquivos de entrega previstos

Criar `docs/manual-usuario/` com `README.md` como página inicial e os capítulos abaixo. Ajustar a divisão apenas se o inventário fechado demonstrar um fluxo melhor; manter todos os IDs A/E/C/D/R/S/J do inventário rastreáveis em `STATUS.md`. O manual pode ser lido como Markdown no repositório sem ferramentas especiais.

| Arquivo | Conteúdo mínimo |
| --- | --- |
| `README.md` | Versão/data, público, índice clicável, início rápido por perfil, mapa simples da jornada da edição, glossário curto e como localizar ajuda |
| `01-acesso-e-conta.md` | Login único, sair, sessão expirada, primeiro acesso do aluno, termos, perfil, foto e senha quando houver UI |
| `02-administrador-edicao.md` | Criar/selecionar edição; categorias, turmas, alunos/importação, locais/regulamento, modalidades, equipes, pontuação, resumo e colaboradores |
| `03-agenda-e-inscricoes.md` | Preparação, geração do rascunho, publicação, janela de inscrição, revisão, pendências, encerramento e liberação; estados e limites |
| `04-competicao-e-mesario.md` | Agenda, jogos, placar por variante confirmada, pontos/destaques, ocorrências, resultado, avanço, chaveamento, trabalho offline e sincronização |
| `05-aluno.md` | Início, consulta de agenda prevista, escolha de modalidades, jogos, ranking, termos e perfil sob a perspectiva do aluno |
| `06-resultados-e-consultas.md` | Ranking, publicação/visibilidade, histórico da turma, arrecadação, ocorrências, indicadores e consulta de edições encerradas |
| `07-problemas-comuns.md` | Sintoma → causa verificável → ação segura; sessão, autorização, edição errada, inscrição fechada, conflito de horário, elenco mínimo, sem rede e fila pendente |
| `imagens/` | Apenas capturas necessárias, sintéticas, legíveis, com nome descritivo e texto alternativo; não usar imagens para substituir passos |

**Índice por tarefa:** o `README.md` deve ligar diretamente a “quero preparar uma edição”, “quero abrir inscrições”, “quero operar um jogo”, “quero me inscrever”, “quero conferir o ranking” e “tenho uma operação pendente”. Também oferecer índice por perfil. Links para capítulos e âncoras devem funcionar na renderização Markdown comum.

## Modelo obrigatório de cada procedimento

```markdown
### Ver a agenda antes de se inscrever

**Quem pode fazer:** aluno da edição [condição confirmada].
**Antes de começar:** [sessão, termos e cronograma publicado].
**Onde:** [menu visível] → [tela; URL apenas como apoio].

1. [Clique/toque no controle com o rótulo exibido na versão atual.]
2. [Escolha ...; explicar o dado que precisa preencher.]
3. [Confirme ...; explicitar quando a ação grava ou apenas pré-visualiza.]

**Resultado esperado:** [mudança observável na tela e, se importante, em outra tela].
**Se não der certo:** [mensagem/condição real e recuperação segura].
**Próximo passo:** [link para a tarefa seguinte].
```

Para ações irreversíveis ou que alteram dados de várias pessoas, incluir “O que acontece depois” e o ponto em que se deve conferir a prévia. Para leitura simples, reduzir o modelo sem omitir pré-requisito e resultado. Não expor IDs, payloads, CSRF, SQL, nomes de arquivos PHP ou jargão de implementação ao leitor final. Usar termos da interface (“Gerar rascunho”, “Publicar cronograma”, “Liberar competição”), explicando “edição”, “categoria”, “turma”, “modalidade”, “equipe”, “jogo”, “partida”, “cronograma”, “chaveamento” e “ranking” uma vez no glossário.

## Regras para capturas e exemplos

- Usar somente contas e dados **fictícios** em instalação isolada. Cobrir desktop e celular quando os controles mudarem de lugar. Ocultar matrícula, data de nascimento, foto real, tokens, URL com segredo e dados pessoais antes de salvar a imagem.
- Cada captura mostra um passo ou estado que o texto não esclareceria sozinho; referenciá-la perto desse passo, com legenda curta e texto alternativo que descreva a informação relevante. Evitar prints de página inteira ilegíveis.
- Registrar em `STATUS.md` para cada imagem: cenário, perfil, resolução, versão/HEAD, caminho e estado da UI. Regerar imagens quando o rótulo ou o fluxo mudar; não reaproveitar prints históricos sem conferir a versão.
- Exemplos numéricos de pontuação e de limite devem usar valores de uma edição fictícia e ser claramente identificados como exemplo; não apresentar uma configuração variável como regra universal.

## Tom, acessibilidade e manutenção

Escrever na segunda pessoa, frases curtas e verbos de ação. Usar a grafia dos controles atuais, instruções compreensíveis tanto com mouse quanto por toque e, quando pertinente, localização por cabeçalho/menu para teclado. Não depender só de cor, posição (“botão verde à direita”) ou captura. Textos alternativos, títulos hierárquicos, tabelas pequenas e links descritivos devem permitir leitura com tecnologias assistivas. Mensagens de erro devem ser transcritas com parcimônia e revisadas contra a UI; explicar o que fazer a partir delas.

No início do manual, registrar `Versão do SGI`, data de revisão e responsável pela checagem. Ao mudar fluxo, atualizar capítulo, índice, captura e linha da matriz de cobertura no mesmo trabalho. Documentos de planejamento em `docs/plano-*` são históricos e não devem aparecer como instrução operacional do usuário.
