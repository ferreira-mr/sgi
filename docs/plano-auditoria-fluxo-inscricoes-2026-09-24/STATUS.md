# Status da auditoria e do plano

## Referência

- Data: 24/09/2026, America/Sao_Paulo.
- HEAD: `b31afce8d02b8042cee0f5b578b78f29ea8cf5d7`.
- Checkout já modificado: arquivos de CI/runners/testes/documentação e artefatos de outras tarefas. Nenhuma alteração preexistente foi descartada, staged ou incluída neste pacote.
- Escopo executado: leitura estática de frontend, templates, rotas, domínio/serviços, persistência, migrations e cenários dos testes; criação deste plano.
- URL/ambiente dos alunos: não informado. Navegador, banco, HTTP e versão implantada não foram inspecionados nesta rodada.

## Retorno do usuário incorporado

O usuário não tem certeza se a segunda tentativa foi na mesma edição e informou que os limites de repetição não estavam claros. Acrescentou que os alunos não encontraram onde se inscrever a partir do perfil. O diagnóstico separa repetição permitida antes da liberação, bloqueio esperado depois dela e problema de descoberta da navegação.

## Achados

| ID | Prioridade | Evidência atual | Implementação |
| --- | --- | --- | --- |
| D01 | P1 | Condição de conflito sem comparação temporal identificada no código | Corrigido no validador; regressão de publicação escrita, sem execução |
| D02 | P1 | Escritor de modalidade retirava liberação e invalidava mesmo sem mudança efetiva | Proteção de criação/edição/desativação iniciada; idempotência preservada; regressões escritas, sem execução |
| D03 | P1 | Grade administrativa lia somente jogos físicos | Prévia tabular para rascunho/publicação com modalidade, etapa, horário e local; integração na grade do calendário ainda pendente |
| D04 | P2 | UI confundia fechadas/encerradas e não oferecia transição necessária | API e botões alinhados para encerrar diretamente a partir de fechadas; não executado |
| D05 | P2 | Janela efetiva e atualização de revisão não orientavam o usuário adequadamente | Janela expirada recusada, datas persistidas restauradas e recarga/reconferência após revisão antiga; regressão escrita, sem execução |
| D06 | P2 | Menu tinha Inscrições; perfil sem chamada direta e início com rótulo genérico | Atalhos de perfil para celular/desktop e rótulo explícito no início |
| D07 | P1 | Geração não conferia quantidade/limites atuais do preparo; cobertura divergia | Validação de equipes por turma/limites na geração, publicação e liberação iniciada; regressão escrita, sem execução |
| D08 | P1 | Publicação sem revalidação externa; guarda compartilhada considerava histórico | Revalidação de reservas/jogos após travar locais e seleção apenas da publicação vigente; regressão escrita, sem execução |
| D09 | P2 | Avanço do cursor podia saltar vaga válida | Cursor passa ao primeiro término mais margem; regressão de horário escrita, sem execução |

E00–E05: implementação parcial em andamento. E06: pendente. V01–V23: não executados por solicitação do usuário. O achado estático continua sem reprodução do incidente real.

## Comandos e verificações desta rodada

- `git status --short` e `git rev-parse HEAD`: identificaram o checkout e suas alterações preexistentes.
- `rg`/`Get-Content`: inspeção de contratos, caminhos e cenários; sem executar aplicação ou testes.
- `git diff --check`: aprovado para as mudanças rastreadas; avisos de normalização CRLF/LF em arquivos preexistentes.
- Sete documentos novos conferidos separadamente com `git diff --no-index --check -- /dev/null <arquivo>`: nenhuma mensagem de erro de whitespace; retorno 1 da comparação com arquivo vazio, que representa arquivos adicionados. Arquivos não rastreados não entram no `git diff --check` comum.
- Referências Markdown locais conferidas nos sete documentos: nenhum destino ausente. Caminhos e comandos de validação foram comparados com os arquivos/scripts atuais.
- Nenhuma suíte automatizada, build, migration, seed, reset, commit, push ou deploy foi executado.

## Implementação iniciada após autorização

- `MysqliCronogramaRepository`: compara conflitos de inscrição com horário real; valida preparo por turma; revalida locais, reservas e jogos imediatamente antes da publicação; verifica correspondência da árvore ao liberar; e avança o cursor até o primeiro término de reserva mais margem.
- `MysqliModalidadeRepository`: trata salvamento idêntico como idempotente, bloqueia alterações estruturais após liberação, invalida revisão após mudança efetiva e protege adição/desativação de modalidade.
- `CronogramaService` e telas: recusa janela já expirada, restaura datas salvas, explica estado temporal, apresenta a grade como prévia e oferece chamadas explícitas às inscrições no perfil e no início do aluno.
- `CronogramaPlanejadoTest.php`: foram adicionadas regressões de inscrição em horários separados, preparo desatualizado, janela expirada, reserva criada após geração, primeiro horário livre e configuração após liberação. **Não executadas**, conforme instrução.
- Ainda pendente: integrar a prévia à própria grade visual do calendário, revisar todos os escritores de escopo relacionados e executar a matriz apenas quando autorizado. D01–D09 ainda não foram validados por runtime/HTTP/navegador nesta implementação.

## Verificações estáticas da implementação

- `php -l` nos quatro arquivos PHP de aplicação/persistência, nos dois templates alterados e no teste de integração: sem erros de sintaxe.
- `node --check` nos três arquivos JavaScript alterados: sem erros de sintaxe.
- `git diff --check`: sem erros de whitespace; Git exibiu apenas avisos de normalização CRLF/LF já presentes no checkout.
- Nenhuma suíte automatizada, build, chamada HTTP, consulta ao banco, migration, seed, reset, commit, push ou deploy foi executado.

## Limites

Não é possível concluir se o incidente concreto foi D01, outro achado, estado corretamente bloqueado ou uma versão antiga servida aos alunos. A aprovação dos testes foi relatada pelo usuário e há registros históricos no repositório; não foi revalidada nem contestada por uma execução nova.

Próxima etapa: continuar a prévia visual do calendário e fechar os escritores laterais; quando o usuário liberar, executar a regressão específica e a matriz. Não marcar os achados resolvidos nem transportar aprovações de pacotes anteriores para esta matriz.
