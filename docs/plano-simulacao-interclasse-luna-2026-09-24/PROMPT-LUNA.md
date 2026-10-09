# Prompt para Luna — continuar a simulação integral do Interclasses

Continue a implementação definida neste pacote a partir do estado atual do repositório. Leia `AGENTS.md`, [`README.md`](README.md), [`STATUS.md`](STATUS.md), [`03-arquitetura-e-etapas.md`](03-arquitetura-e-etapas.md), [`04-validacao-e-evidencias.md`](04-validacao-e-evidencias.md), o relatório/checkpoints do último run e o diff local antes de editar. Preserve mudanças locais preexistentes. Não recomece a simulação e não trate uma suíte verde como prova de critérios que os próprios checkpoints marcam parciais ou não executados.

## Estado validado

O gate completo mais recente é `docker-20260925_113751_9d23b2`, em 25/09/2026, PHP 8.4 e MariaDB em Compose descartável. O comando foi:

```powershell
powershell -ExecutionPolicy Bypass -File tools/test-docker.ps1 -Database mariadb -IncludeVisual
```

Terminou com exit code 0, sem retry/flaky, em 28 min 08,533 s. Passaram qualidade, PHPUnit (394 testes, 2.718 asserções, uma depreciação), integração (1.081 asserções), navegador (173/173), contrato visual (2/2), preparação e reconciliação S00–S12 e o portal. Artefatos: [`run-manifest.json`](../../test-results/docker-20260925_113751_9d23b2/run-manifest.json), [`report.md`](../../test-results/docker-20260925_113751_9d23b2/simulacao-interclasse/report.md), [`checkpoints.json`](../../test-results/docker-20260925_113751_9d23b2/simulacao-interclasse/checkpoints.json), `observed.json`, `coverage.json`, `browser-results.json`, `browser-correction-diagnostics.json` e `events.jsonl` no mesmo diretório.

A edição contínua teve sete turmas sintéticas × 32 alunos (224), duas categorias, dez modalidades, 322 inscrições, 15 jogos e quatro provas individuais. Todos os jogos e provas passaram pela UI; dois mesários operaram em paralelo. Três jogos da chave II-FUTSAL foram disputados offline na mesma aba preparada, e a fila IndexedDB reconciliou o ID temporário da final. O portal autenticou 224 alunos. O resultado reconciliado teve 313 pontos ativos, um anulado, 400 pontos esportivos, 427 de arrecadação, 35 de penalidade, 827 bruto e 792 líquido.

V22 está aprovado na edição sintética para perda de resposta depois do commit e repetição idempotente de ponto, resultado/avanço, ocorrência e crédito; o estorno repetido também passou na integração. V24 também passou: pela mesma edição, um colaborador diferente reapresentou a chave e o payload de crédito do administrador e recebeu HTTP 409; a conferência comprovou que o histórico e o crédito permaneceram inalterados. Payload divergente de ocorrência/crédito também foi recusado. A cobertura está em `coverage.json` e `checkpoints.json`; não substitua essa evidência por mocks.

Durante esta continuação, um gate completo anterior (`docker-20260925_090730_64e6f7`) falhou quando uma correção de ponto ocorria após várias jogadas. O cenário agora seleciona explicitamente 20 minutos e registra/anula a jogada deliberada logo após o início; assim o teste não depende do estado acumulado do placar. O diagnóstico é sanitizado e foi aprovado no gate mais recente. Outra falha focal de URL relativa em `docker-20260925_084524_fcfa47` foi corrigida usando `/api/v1/` como fallback quando `window.SGI_API_BASE` não existe nessa casca. Preserve essas regressões e não remova os relatórios de falha anteriores.

## Pendências verificadas

A matriz atual contém 13 aprovados (V01, V06, V08, V13, V17, V20, V21, V22, V24, V27, V30, V35, V36), 14 parciais (V02, V05, V09, V10, V12, V14, V15, V16, V18, V19, V26, V28, V29, V31) e 9 não executados (V03, V04, V07, V11, V23, V25, V32, V33, V34). Use as razões no `checkpoints.json` como contrato de escopo para a próxima rodada.

Prossiga em lotes pequenos, fechando um critério com comportamento observável e evidência antes de iniciar outro:

1. Faça uma auditoria curta dos testes atuais para separar lacuna de cobertura de defeito real. Priorize V23, V25 e V32 (resposta inválida, expiração/renovação de sessão e rollback), pois envolvem integridade da fila e autorização; V24 já está comprovado para arrecadação, podendo ser ampliado a outras rotas se houver risco demonstrável. Depois complete onboarding UI (V05), negativos de matrícula/elegibilidade/revisão (V03–V04, V07, V11) e os estados parciais.
2. Para cada cenário, siga as rotas e os serviços atuais; inclua teste de regressão que falhe sem a correção quando encontrar defeito. Teste sucesso, recusa, isolamento por edição/usuário, persistência e ausência de efeito parcial conforme aplicável. Não relaxe regras nem introduza caminhos de teste que contornem HTTP/UI quando esses são o objeto do critério.
3. Para concorrência (V26), use barreiras determinísticas, não `sleep`; cubra última vaga, publicação, ponto versus encerramento, finalização dupla e estorno duplicado com prova do estado persistido. Para offline, mantenha a mesma aba preparada, IndexedDB real, dependências e identidade da mutação. HTTP 200 com HTML, JSON malformado ou erro no corpo nunca confirma uma operação.
4. Para chaveamentos (V15/V33), valide somente topologias e regras que o produto suporta. Cubra 2/3/4/5/8 participantes/equipes conforme o contrato atual; documente requisitos esportivos ausentes em vez de inventar W.O., sets, pênaltis ou suspensões.
5. Para V34, rode dois ambientes limpos com manifesto/semente iguais e compare saídas normalizadas, retirando IDs e timestamps voláteis. Para V02/V03, preserve 32 estudantes por sala e valide importação/manifestos com salas adicionais sem colidir a edição principal.
6. Antes de mudanças funcionais, registre baseline focal. Rode a regressão específica após editar e, ao concluir o lote, o gate completo `tools/test-docker.ps1 -Database mariadb -IncludeVisual`. Mudança SQL exige os testes de instalação/atualização/repetição e os motores indicados pelo `AGENTS.md`. Não declare aprovado um retry instável ou uma etapa ignorada.
7. Atualize o status, este prompt, checkpoints e relatório gerado com estados reais, comando, ambiente, hora/fuso, revisão, resultado e caminhos de evidência. Rode `git diff --check` e revise o diff final. Não faça push, merge nem deploy sem pedido.

## Limite de dados reais

A configuração é sintética e não comprova aderência à competição da escola. Ainda faltam a lista oficial de turmas/salas e modalidades, locais, calendário, regras de elegibilidade e regulamento esportivo; totais anonimizados podem substituir dados pessoais. Não fabrique informação. Até receber essa fonte, declare apenas que a simulação técnica reproduziu o manifesto sintético documentado.

## Segurança e isolamento

Siga o `AGENTS.md` atual. Todo teste que usa SQL roda exclusivamente por `tools/test-docker.ps1`/`.sh` ou `tools/test-local.ps1`, usando container descartável. Nunca use banco local/de trabalho para reset, seed ou integração, não desative proteções e não execute isoladamente Playwright, `tests/run_all.php` ou seeds. Não registre matrículas, senhas, tokens, cookies ou dados pessoais nos artefatos. Preserve o projeto de 224 alunos, seus artefatos anteriores e as regressões já implementadas.
