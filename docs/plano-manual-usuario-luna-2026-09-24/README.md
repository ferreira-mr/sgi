# Manual do usuário do SGI — roteiro para Luna

**Estado: plano documental; manual ainda não produzido.** Levantamento inicial em 24/09/2026, America/Sao_Paulo, sobre o `HEAD` `b31afce8d02b8042cee0f5b578b78f29ea8cf5d7` e uma árvore de trabalho com alterações preexistentes. A implementação deve conferir novamente o código atual antes de redigir.

## Objetivo e público

Produzir um manual completo, em português claro, para quem usa o SGI no navegador: **administrador**, **colaborador**, **mesário** e **aluno**. O leitor deve conseguir concluir as tarefas do seu perfil sem conhecer PHP, APIs, banco ou o README técnico. O conteúdo deve começar pela jornada real da edição, oferecer procedimentos curtos por tarefa e explicar o que o sistema mostra quando uma ação está indisponível, falha ou depende de uma etapa anterior.

O produto final será `docs/manual-usuario/README.md` com capítulos Markdown, imagens locais sanitizadas quando úteis, índice e links relativos válidos. Não é um manual de instalação, administração do servidor ou testes; para esses temas, apontar para [README](../../README.md) e [implantação](../deployment.md). Não prometer PDF, impressão, notificações, recuperação de senha ou outra função sem confirmar sua presença na versão em uso.

## Fontes e precedência

1. [AGENTS.md](../../AGENTS.md), `config/routes/web.php`, `config/routes.php`, guardas de acesso, controladores e serviços estabelecem o que existe e quem pode fazer cada ação.
2. Views e scripts de `resources/` dão nomes atuais de botões, sequência e mensagens; testes de HTTP/navegador confirmam os estados observáveis.
3. A jornada em [README](../../README.md) e os planos recentes em `docs/` ajudam a localizar mudanças, mas não substituem o contrato atual. [Requisitos](../requisitos.md) contém propostas históricas: conferir antes de aproveitar qualquer afirmação.
4. A interface executada em ambiente **isolado e com dados fictícios** decide a forma final das instruções e das capturas. Registrar versão, perfil, edição, tela e data das evidências.

## Pacote de execução

| Documento | Uso |
| --- | --- |
| [00-inventario.md](00-inventario.md) | Mapa preliminar de páginas, perfis, funções e dúvidas que precisam ser fechadas |
| [01-estrutura-e-padrao.md](01-estrutura-e-padrao.md) | Sumário do manual, padrão de cada procedimento e convenções editoriais |
| [02-etapas.md](02-etapas.md) | Ordem detalhada M00–M09, entregas e critérios de passagem |
| [03-validacao.md](03-validacao.md) | Matriz de cobertura V01–V18 e conferências de links, conteúdo e imagens |
| [STATUS.md](STATUS.md) | Registro de execução do Luna, inicialmente não iniciado |
| [PROMPT-LUNA.md](PROMPT-LUNA.md) | Texto pronto para passar o roteiro ao modelo Luna |

## Ordem de trabalho

1. Ler as instruções atuais do repositório e este pacote inteiro.
2. Executar M00–M02: confirmar a versão, fechar o inventário e obter uma instalação/fixture isolada para observar as jornadas.
3. Redigir M03–M07 por dependência: acesso → administrador → mesário → aluno → situações de erro e consulta.
4. Executar M08–M09: revisão cruzada com o sistema, acessibilidade, links e entrega, registrando as evidências em `STATUS.md`.

**Limites:** este roteiro não autoriza alterar o comportamento da aplicação, limpar IndexedDB/fila, redefinir contas, usar dados pessoais reais, resetar a base de trabalho, publicar o manual ou fazer push/deploy. Uma divergência entre UI e código deve ser registrada como achado; não inventar um fluxo para fazer o texto parecer completo.
