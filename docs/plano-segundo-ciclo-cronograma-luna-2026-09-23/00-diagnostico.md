# Diagnóstico e evidências

## D01 — botões presos ao histórico de cliques (alta)

Arquivo: `resources/js/pages/eventos/configurar-agenda.js`, bloco iniciado por `let cronogramaEstado = null`, especialmente `mostrarCronograma` e listeners de `cronogramaAbrir`, `cronogramaFechar`, `cronogramaRevisar` e `cronogramaLiberar`.

Cada listener desabilita seu botão e só o reabilita no catch. Após sucesso, `atualizarCronograma` atualiza estado/texto; `mostrarCronograma` não recalcula ações. Sequência reproduzida: gerar → publicar → abrir → revisar → gerar → publicar. “Abrir inscrições” e “Reabrir revisão” permanecem desabilitados. O segundo clique não envia requisição. Recarregar a página mascara esse defeito.

Confirmado executando o bloco original em Node com DOM e respostas controlados. A sonda está em `test-results/auditoria-segundo-cronograma/reproduzir-interface.cjs`; saída em `interface.log` na mesma pasta. Não é teste de navegador real nem prova do backend. Luna deve converter a reprodução em teste permanente, incluindo Encerrar e as transições permitidas.

## D02 — revisão ocupa os horários que pretende substituir (alta)

Arquivo: `src/Modules/Competicoes/Infrastructure/MysqliCronogramaRepository.php`, métodos `review`, `generateDraft`, `occupiedSlots` e `nextDraftSlot`.

`review` incrementa `cronograma_versao` e preserva `versao_publicada`. `generateDraft` escolhe essa publicação como `occupiedVersion`. `occupiedSlots` inclui TODOS os seus compromissos no UNION de reservas e jogos. O gerador tenta encaixar a nova agenda além da anterior, embora a revisão substitua aquela publicação.

Consequência derivada diretamente do código: com uma janela justa, a primeira agenda cabe; a revisão com os mesmos parâmetros pode retornar pendências ou deslocar horários sem nova restrição real. Exemplo de regressão: duas equipes, um confronto de 20 minutos, um local e janela 08:00–08:20; publicar, revisar e gerar novamente. O compromisso anterior bloqueia a única vaga. Preservar o snapshot não exige mantê-lo como reserva ativa da própria substituição.

Confirmado por inspeção da seleção SQL e do algoritmo; não houve nesta auditoria reprodução HTTP focada desse exemplo mínimo. O teste de integração existente gera novamente numa janela larga 08:00–18:00 e não compara os horários anteriores, portanto pode passar apesar do defeito. Não apagar reservas independentes ou jogos para fazê-lo passar.

## D03 — pendências válidas viram erro genérico (média)

`generateDraft` retorna `{success:false, pendencias:[...], nos, compromissos, cronograma_versao}` quando a janela não comporta tudo, sem `message`. O controller devolve JSON HTTP 200. `enviarCronograma` lança exceção para qualquer `success:false` e descarta o corpo antes de o listener ler as pendências. Resultado reproduzido na sonda: “Operação recusada (HTTP 200)”. A UI não explica modalidade, nó ou motivo. D02 pode disparar precisamente esse caminho.

## D04 — rascunho obsoleto e concorrência da interface (média)

Após gerar, alterar data/hora/duração não invalida `cronogramaRascunho` nem Publicar. Confirmado na sonda: a publicação envia o rascunho anterior após mudar o horário no campo. Além disso, a revisão enviada vem de `cronogramaEstado`, e não da revisão vinculada ao rascunho. Gerar e Preparar não têm bloqueio de operação; respostas simultâneas podem substituir a proposta em memória fora de ordem. Estes últimos cenários de concorrência foram identificados no código e ainda exigem reprodução adversarial.

Outro caso a cobrir: POST de publicação confirmado seguido de GET de estado com erro. O rascunho já foi apagado, mas o catch habilita Publicar; o listener retorna sem fazer nada porque não há proposta. Não confundir falha de atualização visual com recusa da publicação.

## D05 — duas interfaces de programação e ações incompatíveis (média)

`resources/views/pages/eventos/configurar-agenda.php` contém o painel planejado e `modalDatasAutomaticas`. `configurar-agenda.js` mantém `simular_sequencial`/`confirmar_sequencial` em `/api/v1/agenda-blocos` além de `gerar_rascunho`/`publicar` em `/api/v1/cronograma`.

`MysqliAgendamentoBlocoRepository::assertUnpublishedCalendar` recusa o cronograma publicado. Portanto a ação antiga oferecida na tela pode terminar em recusa legítima do servidor. Isso é convivência de fluxos atuais, não evidência de chamada a PHP procedural. Retirar a programação concorrente desta jornada; inventariar reservas e consumidores antes de excluir código compartilhado.

Gerar rascunho em estado publicado também é recusado corretamente. O painel não deriva a habilitação de Gerar desse estado. A ação necessária é Revisar primeiro. Após `operacao_liberada=1`, `review` recusa a substituição da árvore por regra existente; não remover essa proteção para permitir um “segundo ciclo”.

## D06 — jornada E2E filtra jogos por identidade fixa incorreta (alta para validação)

A execução desta auditoria reprovou `tests/browser/cronograma-jornada-e2e.spec.cjs:299`, tanto na tentativa inicial quanto no retry. O teste filtra `nome_jogo.startsWith('PL:4:')` antes de exigir dois jogos. `CronogramaBracketPlanner` define a identidade como `PL:<modalidade>:<turma>:MM:<largura>:<slot>:<tipo>`: o primeiro número não é a largura da semifinal.

O trace da tentativa inicial registra a resposta real de GET jogos com **dois jogos Agendados**: ID 44, `PL:106:49:MM:4:0:N`, e ID 45, `PL:106:49:MM:4:1:N`. O filtro fixo os descarta. Portanto a falha observada nessa asserção é do teste, não ausência de materialização desses dois jogos. Ela bloqueia a execução das etapas posteriores nessa jornada; não permite afirmar que todo o E2E passou.

Corrigir usando os nós/identidades da publicação e os IDs da fixture. Manter a expectativa de dois jogos, modalidade, participantes, fase e horários; não simplesmente remover o filtro ou aceitar qualquer jogo. Auditar demais tags fixas do spec. Evidência: `test-results/docker-20260923_230021_6ec490/browser-playwright.json` e `tests/browser/test-results/docker-20260923_230021_6ec490/browser/database/cronograma-jornada-e2e-Flu-e043e-final-offline-sincronizadas-database/trace.zip` (há também pasta `-retry1`). Apenas campos sintéticos de jogo foram extraídos do trace; não publicar tokens/cookies.

## Por que os testes existentes não bastam

- `tests/browser/cronograma-planejado.spec.cjs`: respostas interceptadas, uma ação de revisão; não republica nem tenta revisar outra vez.
- `tests/browser/cronograma-jornada-e2e.spec.cjs`: APIs reais, primeira publicação até operação offline; não repete o ciclo administrativo antes da liberação.
- `tests/Integration/CronogramaPlanejadoTest.php`: cobre revisão/republicação, mas com janela larga e sem assert de reutilização dos horários.

A aprovação desses testes é compatível com D01–D04. Não usar a execução verde para encerrar os novos aceites. Conferir os resultados desta auditoria no STATUS.

## Achados adicionais na validação e resolução

### D07 — final planejada não ficava pronta para operar offline

Na jornada E2E `20260924_001217_d0a7e5`, a árvore devolvia a final virtual publicada (`id_jogo=-16`, `status_jogo='Aguardando'`). Depois dos dois resultados das semifinais, o motor offline atribuía as equipes finalistas, mas preservava `Aguardando`; assim, a final nunca ficava iniciável pelo mesário. `resources/js/offline/chaveamento-engine.js` agora muda para `Agendado` ao completar os dois participantes e preserva data, horário e local da publicação. `tests/javascript/chaveamento-planejado.test.cjs` reproduz a projeção e a jornada E2E passou no gate final.

### D08 — fixture confundia o estado de liberação

A resposta real de `/api/v1/cronograma` não tem `state.liberada` no nível superior: a liberação vem em `operacao.liberada` e/ou `operacao_liberada`. O helper de navegador lia apenas a propriedade inexistente e tentava reabrir inscrição após liberar a operação, recebendo 422. `tests/browser/cronograma-fixture-helper.cjs` lê o formato canônico e tem teste para ambas as representações efetivamente retornadas.

## Resultado das correções

D01–D08 estão cobertos pelas mudanças descritas no [STATUS](STATUS.md). A jornada passou três ciclos de revisão/publicação na mesma página e com os mesmos horários, inscrição real, liberação, jogos offline e sincronização. O resultado é do commit de referência com checkout sujo; o runner não prova o CI remoto e os resultados detalhados, limitações e artefatos permanecem registrados no STATUS.
