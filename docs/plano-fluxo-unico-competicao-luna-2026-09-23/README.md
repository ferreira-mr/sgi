# Fluxo único de calendário e chaveamento — roteiro para Luna

**Estado: fluxo principal implementado; matriz de aceitação parcialmente coberta.** Elaborado em 23/09/2026, America/Sao_Paulo. A bateria completa em MariaDB passou em 23/09/2026; veja [STATUS](STATUS.md) para comandos, evidências e pendências V01–V20. Não considerar a aprovação da bateria como conclusão dos cenários ainda parciais.

## Resultado esperado

O administrador prepara equipes vazias, gera uma única árvore com horários, publica o calendário e abre inscrições. Os alunos consultam esse calendário antes de escolher modalidades. Depois do encerramento e da resolução dos elencos incompletos, o administrador libera a competição. O sistema cria os jogos operacionais a partir da árvore publicada e avança suas fases online/offline sem outro sorteio, geração independente ou alteração silenciosa de horários.

A tela Chaveamento permanece para visualizar a árvore, acompanhar resultados e acessar jogos. A ação independente “Gerar chaveamento” deixa de ser um caminho de preparação. Planejamento e execução são etapas do mesmo fluxo; não são duas competições.

## Relação com os planos existentes

Este pacote complementa os planos de [cronograma e inscrições de 21/09](../plano-cronograma-inscricoes-luna-2026-09-21/README.md) e de [correções de 22/09](../plano-correcao-cronograma-luna-2026-09-22/README.md). Seu foco é fechar a ligação entre calendário, liberação, jogos, avanço e interface. Não reexecutar cegamente todos os planos antigos nem tratar seus STATUS como evidência de aprovação destes aceites.

O código inspecionado ainda possui geração direta em `/api/v1/chaveamentos`, liberação que apenas altera estado e materialização separada por nó. Há também consumidores de tags `MM:` enquanto os nós planejados usam `PL:`. Essas conexões devem ser verificadas por comportamento, não apenas por existência de métodos.

AGENTS.md e instruções atuais do usuário prevalecem sobre documentos históricos. Em particular, este plano não autoriza apagar dados, modificar migrações aplicadas, limpar filas offline ou remover formatos persistidos ainda exigidos pelo contrato atual. Não criar um segundo motor de resultados para resolver a transição.

## Ordem de leitura e execução

1. Ler [AGENTS.md](../../AGENTS.md), [README do projeto](../../README.md), [arquitetura](../architecture.md), [testes](../testing.md) e [implantação](../deployment.md).
2. Ler [inventário](00-inventario.md), [contratos](01-contratos.md) e [STATUS](STATUS.md).
3. Executar [U00–U09](02-etapas.md) em ordem, com a [matriz de validação](03-validacao.md).
4. Registrar evidência e próxima ação no STATUS após cada etapa.
5. Usar [PROMPT-LUNA.md](PROMPT-LUNA.md) para iniciar ou retomar a implementação em uma tarefa configurada com Luna.

| Etapa | Entrega | Dependência |
| --- | --- | --- |
| U00 | Baseline, contratos atuais e mapa de chamadas | — |
| U01 | Regressões do fluxo com equipes vazias | U00 |
| U02 | Identidade entre planejamento e jogos; política de revisão | U01 |
| U03 | Liberação atômica cria os jogos disponíveis | U02 |
| U04 | Avanço e resultados utilizam a árvore publicada | U03 |
| U05 | Preparo, avanço e sincronização offline no mesmo contrato | U04 |
| U06 | Consultas e telas representam planejamento e operação | U05 |
| U07 | Retirada da geração independente e integração dos escritores | U06 |
| U08 | Jornada real completa e matriz adversarial | U07 |
| U09 | Bateria final, documentação e entrega | U08 |

## Limites

Não redesenhar todo o produto, mudar regulamento/pódio, criar inscrição offline, framework, ORM ou dependências gerais. Datas e usuários dos testes são sintéticos. Não publicar, fazer push, merge ou deploy automaticamente. Commits da implementação seguem AGENTS e não incluem alterações preexistentes.

O pacote começou como plano de implementação e agora registra a execução correspondente. Commits incluem somente os arquivos deste fluxo; alterações preexistentes de outras tarefas continuam preservadas fora deles. Não há autorização para push, merge ou deploy.
