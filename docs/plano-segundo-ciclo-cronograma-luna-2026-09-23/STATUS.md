# Status da implementação e validação

## Referência

- Data: 23/09/2026, America/Sao_Paulo (execuções até 24/09/2026 UTC).
- HEAD de referência: `1ac473ce782c8268e9e817b785ca6b20e95b3211`.
- Checkout já continha alterações de outras tarefas; nenhuma foi descartada, staged ou incluída em commit.
- Premissa aplicada: implantação nova, sem compatibilidade com formatos antigos. Não foi necessária migração estrutural.
- Estado: S00–S06 concluídas; bateria final MariaDB aprovada, integração MySQL aprovada.

## O que foi implementado

- A revisão gera contra os horários da própria publicação suspensa sem tratá-los como ocupação ativa; reservas independentes e jogos materializados continuam bloqueando conflitos. Snapshots anteriores continuam registrados.
- Ações do painel agora derivam do estado confirmado pelo servidor. A proposta é vinculada à revisão e aos parâmetros que a geraram; mudanças de horário, preparação, estado divergente e respostas atrasadas impedem publicação obsoleta.
- Respostas de domínio com pendências são apresentadas com contexto. Respostas HTML/JSON inválidas, HTTP ruim, falha de rede e falha de consulta após uma mutação confirmada não anunciam sucesso falso nem deixam Publicar habilitado sem proposta válida. O estado pode ser consultado novamente.
- Abertura/encerramento repetidos são idempotentes. Inscrições não reabrem e a revisão não substitui a árvore depois da liberação.
- O fluxo administrativo concorrente de programação sequencial foi retirado da página; gerar/revisar/publicar ocorre no painel planejado. `agenda-blocos` permanece porque a casca offline atual do mesário ainda consulta reservas vigentes; não é um adaptador para versão antiga.
- Corrigido o avanço local offline: quando os dois semifinalistas chegam à final virtual publicada, o jogo passa de `Aguardando` para `Agendado`, preservando seu compromisso.
- Fixtures leem o estado canônico de liberação (`operacao.liberada`/`operacao_liberada`) e a jornada E2E usa identidade derivada da modalidade/turma, sem prefixo fixo `PL:4:`.
- Documentação de operação em [README](../../README.md) e [arquitetura](../../docs/architecture.md) explica os ciclos de revisão e o bloqueio após liberação.

## Aceites V01–V16

| ID | Estado | Evidência registrada |
| --- | --- | --- |
| V01 | Aprovado | Painel mock percorre três ciclos de abrir, encerrar, revisar, gerar e publicar; a jornada real também repete sem reload. |
| V02 | Aprovado | Integração com janela justa compara data, início, fim e local com a versão suspensa; E2E mantém os mesmos slots nas três publicações. |
| V03 | Aprovado | Reserva independente mantém a primeira vaga bloqueada; publicação incompleta e liberação com conflito não deixam gravação parcial. |
| V04 | Aprovado | Revisão mantém snapshot publicado, elencos e regras de conflito; publicação com revisão antiga não grava nem substitui snapshot. |
| V05 | Aprovado | Interface mostra a mensagem da pendência e desabilita Publicar. |
| V06 | Aprovado | Alterar parâmetros e preparar equipes invalidam a proposta anterior. |
| V07 | Aprovado | Clique duplicado durante geração não envia uma segunda mutação; resposta atrasada após editar parâmetros não recupera a proposta antiga. |
| V08 | Aprovado | Integração tenta publicar com versão antiga e confirma recusa sem gravação, mantendo a revisão corrente. |
| V09 | Aprovado | POST confirmado seguido de GET 503 mantém Publicar desabilitado; atualizar recupera o estado publicado sem repetir o POST. |
| V10 | Aprovado | Cobertos domínio com pendências, HTTP 500, timeout de rede e resposta HTML inválida; a proposta continua bloqueada até uma geração válida. |
| V11 | Aprovado | Página administrativa contém apenas o fluxo canônico e o teste confirma que não chama `agenda-blocos`. |
| V12 | Aprovado | Integração confirma idempotência ao abrir/encerrar, bloqueio de reabertura após liberar e preservação da árvore. |
| V13 | Aprovado | Resposta atrasada não altera painel desativado; runtime existente cobre reativação sem duplicar listeners; navegação com prefixo é exercitada. |
| V14 | Aprovado | Teste HTTP específico valida admin, CSRF, recusa de mesário/aluno e escopo de edição do aluno. |
| V15 | Aprovado | Navegador publica, inscreve alunos reais, libera, opera semifinais/final offline e sincroniza; E03 confere rótulos e controles do painel e a bateria visual geral passa. |
| V16 | Aprovado | E2E deriva as tags da fixture e exige os dois jogos iniciais corretos; não há filtro fixo `PL:4:`. |

## Execuções finais

### Gate completo — MariaDB 10.11 / PHP 8.4

Comando:

```powershell
powershell -ExecutionPolicy Bypass -File tools/test-docker.ps1 -Database mariadb -IncludeVisual
```

- Run ID: `20260924_010701_b98d54`; Compose descartável `sgi-test-20260924-010701-b98d54`.
- Início: 23/09/2026 22:07:01 BRT / 24/09/2026 01:07:01 UTC.
- Fim: 23/09/2026 22:18:16 BRT / 24/09/2026 01:18:16 UTC; duração 675,625 s.
- Resultado: `passed`, exit 0. Build, qualidade, integração, navegador, visual e limpeza passaram.
- Qualidade: PHPUnit 390 testes / 2.694 assertions; lint, análise estática, checagem JS e build aprovados. PHPUnit reportou uma depreciação, sem falha.
- Integração: 1.055/1.055 asserções, zero falhas.
- Navegador: 171 aprovados, 0 falhas, 0 flaky, 0 skips. Inclui a jornada E2E do cronograma e placar online/offline.
- Contrato visual: 2/2 aprovados.
- Artefatos: `test-results/docker-20260924_010701_b98d54/run-manifest.json`, `integration-timings.json`, `browser-playwright.json`, `visual-playwright.json` e `docker-compose.log`. Evidências Playwright em `tests/browser/test-results/docker-20260924_010701_b98d54/`.

### Integração cruzada — MySQL 8.4 / PHP 8.4

Comando:

```powershell
powershell -ExecutionPolicy Bypass -File tools/test-docker.ps1 -Database mysql -SkipQuality -SkipBrowser
```

- Run ID: `20260924_011827_664bc6`; início 23/09/2026 22:18:27 BRT, fim 23/09/2026 22:20:19 BRT.
- Resultado: `passed`, exit 0; integração 1.055/1.055, build e limpeza aprovados.
- Artefatos: `test-results/docker-20260924_011827_664bc6/run-manifest.json`, `integration-timings.json` e `docker-compose.log`.
- Qualidade, browser e visual não foram selecionados nesta checagem MySQL; o gate completo dessas camadas foi executado em MariaDB.

### Verificações adicionais

- `npm test`: 134/134 testes JavaScript, exit 0.
- `node --check` nos specs E2E/helper atualizados e `php -l` nos testes PHP alterados: sem erros.
- `git diff --check`: exit 0; o Git alertou apenas sobre normalização CRLF/LF em arquivos já modificados do checkout.
- Tentativa intermediária de teste de autorização consultou o endpoint antes da migration de cronograma e revelou HTTP 500 da fixture sem schema. O cenário foi reposicionado após a migration, usando uma fixture preparada; a regressão final passou em MariaDB e MySQL.
- Run ID focal MariaDB da autorização e escopo: `20260924_010504_00547f`, 1.055/1.055.
- Os containers, volumes e redes descartáveis dos runners foram removidos. Nenhuma base local de trabalho ou dados pessoais foram resetados.

## Limitações

- CI remoto não foi executado; não houve push, merge ou deploy.
- Uma depreciação PHPUnit permanece reportada pelo conjunto atual de qualidade; a suíte encerrou com exit 0.
- Não houve necessidade de alterar schema; a instalação descartável do runner aplicou as migrations e exerceu o fluxo vazio.
- Como o checkout já continha mudanças sobrepostas nos arquivos centrais, não foi feita uma rodada “vermelha” desfazendo-as para cada D01–D05. As regressões observáveis foram cobertas e passaram no checkout final; D06 falhou no baseline e D07 foi observado durante a jornada anterior à correção.

## Registro final

```text
S00–S06: concluídas.
V01–V16: aprovados pelas evidências listadas acima.
HEAD: 1ac473ce782c8268e9e817b785ca6b20e95b3211.
Árvore de trabalho: suja por alterações preexistentes e alterações desta implementação; tudo permaneceu sem stage/commit.
Próxima ação: revisão humana do diff e integração conforme o fluxo do repositório.
```
