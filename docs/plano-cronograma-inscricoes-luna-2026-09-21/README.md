# Cronograma anterior às inscrições — roteiro para Luna

**Estado:** implementação concluída na branch `codex/cronograma-inscricoes-luna-2026-09-21`; aceite registrado em [STATUS.md](STATUS.md). Elaborado em 21/09/2026 sobre o commit `c8e9c1be85a49bccfa0c6cca88db97d11f33ed2f`.

## Resultado esperado

Cadastrar as modalidades com quantidade definida de equipes/entradas por turma, preparar essas equipes sem alunos, gerar e publicar toda a programação e só então abrir inscrições. O aluno escolhe uma equipe/vaga da própria turma e o servidor impede conflitos de agenda, inclusive em compromissos condicionais representados pelo rascunho atual.

**Decisões expressas do usuário:** cabo de guerra fora do evento; nenhuma disputa ou avanço entre categorias diferentes. Os recursos físicos continuam compartilhados entre categorias. Excluir cabo de guerra deste planejamento não autoriza apagar cadastros ou resultados históricos.

Este pacote segue a organização dos roteiros anteriores em `docs`: ponto de entrada, tarefas sequenciais, critérios de aceite e registro de evidências. Não inicia outro modelo, não cria tarefas no aplicativo e não altera configuração de raciocínio. Foi escrito para que Luna possa executar sem recuperar a conversa ou acessar o arquivo original em Downloads.

## Ordem de leitura e execução

1. Leia [AGENTS.md](../../AGENTS.md), [README do projeto](../../README.md), [arquitetura](../architecture.md), [testes](../testing.md) e [implantação](../deployment.md).
2. Leia [regras](01-regras-e-fluxos.md) e [desenho técnico](02-contratos-e-arquitetura.md).
3. Execute as tarefas de [implementação](03-etapas-de-implementacao.md) em ordem, com a [matriz de validação](04-validacao.md).
4. Atualize [STATUS.md](STATUS.md) após cada tarefa. Retome da primeira incompleta, sem refazer o que permanece validado no mesmo código.

O código, as rotas e os executores atuais prevalecem sobre exemplos históricos. O checkout usa `database/schema-inicial.sql` e migrations numeradas; não copie números de migrations nem permissões para reset de outros planos.

## Escopo e decisões de implementação

- Implementar o ciclo completo; não entregar apenas um campo novo no cadastro ou um aviso visual de conflito.
- Reaproveitar equipes, vínculos, agenda, reservas e chaveamento existentes. Não criar um segundo motor de resultados.
- Quantidade planejada, limite de equipes e capacidade de elenco têm semânticas distintas.
- A inscrição é na equipe/entrada da modalidade, válida para todo o percurso da competição; não é uma inscrição independente em cada jogo.
- O fluxo planejado é o contrato único das edições deste desenvolvimento, desde o cadastro das modalidades até a abertura das inscrições.
- Publicação exige todas as modalidades participantes prontas, horários completos e ausência de pendências bloqueantes.
- Alertas de conflito impedem confirmação; a validação também alcança inclusão e transferência administrativa.
- Decisões específicas do evento que ainda faltam são configuração, não constantes no código. A falta de datas reais não impede desenvolver e testar com fixtures sintéticas.

## Entregas

| Tarefa | Entrega |
| --- | --- |
| T00 | Baseline, mapa dos contratos e testes de caracterização |
| T01 | Schema evolutivo e regras de configuração |
| T02 | Preparação idempotente das equipes/vagas |
| T03 | Árvore persistida de nós/BYEs e projeção inicial de compromissos por equipe |
| T04 | Geração determinística de agenda e análise de pendências para os compromissos projetados |
| T05 | Publicação, revisão e abertura/fechamento de inscrições |
| T06 | Inscrição atômica na equipe exata e conflito individual |
| T07 | Telas administrativas e portal do aluno |
| T08 | Proteções de elenco, revisão operacional, materialização idempotente e preservação da fila offline |
| T09 | Baterias oficiais MariaDB/MySQL, navegador e visual executadas; aceite registrado |

## Fora do escopo

Otimização matemática global, lista de espera, inscrição offline de alunos, envio de e-mail/WhatsApp, disputas entre categorias, alteração geral de pontuação/pódio e importação automática do regulamento. A regra ambígua de terceiro lugar com BYE deve ser registrada para decisão da coordenação; não alterar o ranking por inferência neste trabalho.

## Prompt de início ou retomada

```text
Implemente o roteiro docs/plano-cronograma-inscricoes-luna-2026-09-21/README.md.
Leia AGENTS.md, README.md e os documentos vinculados do pacote.
Confira o checkout atual e retome a primeira tarefa incompleta em STATUS.md.
Execute as tarefas sequencialmente, com regressões e testes oficiais isolados.
Preserve alterações preexistentes, dados reais, IDs e filas offline pendentes.
Atualize STATUS.md com comandos, resultados, limitações e próxima ação.
Não considere a entrega validada enquanto houver testes obrigatórios pendentes.
Não faça push sem a bateria completa exigida pelo projeto.
```

Pedidos de esclarecimento devem se limitar a ambiguidades novas que alterem o contrato. Escolhas técnicas reversíveis e já cobertas por este roteiro não precisam de uma nova aprovação. O pacote não autoriza migração, reset ou publicação em uma instalação real.
