# Status da simulação do Interclasses

Atualizado em 25/09/2026 (horário de Brasília). A revisão validada foi `b31afce8d02b8042cee0f5b578b78f29ea8cf5d7`. O checkout já continha outras alterações locais; elas foram preservadas. Nenhum push, merge ou deploy foi feito.

## Resultado mais recente

O gate oficial passou em Compose descartável, PHP 8.4 e MariaDB. Comando:

```powershell
powershell -ExecutionPolicy Bypass -File tools/test-docker.ps1 -Database mariadb -IncludeVisual
```

O run [`docker-20260925_113751_9d23b2`](../../test-results/docker-20260925_113751_9d23b2/) terminou com `passed`, exit code 0, sem retry/flaky, de 08:37:51 a 09:06:00 (America/Sao_Paulo), duração 1.688,533 s (28 min 08,533 s). O [`run-manifest.json`](../../test-results/docker-20260925_113751_9d23b2/run-manifest.json) registra as etapas. Passaram qualidade, integração geral (1.081 asserções), navegador geral (173/173), contrato visual (2/2), preparação/reconciliação S00–S12 e portal dos 224 alunos. PHPUnit executou 394 testes e 2.718 asserções, com uma depreciação reportada e nenhuma falha. O Compose e o volume descartáveis foram removidos.

A edição sintética permaneceu a mesma da preparação ao encerramento. O [`report.md`](../../test-results/docker-20260925_113751_9d23b2/simulacao-interclasse/report.md), [`checkpoints.json`](../../test-results/docker-20260925_113751_9d23b2/simulacao-interclasse/checkpoints.json), [`observed.json`](../../test-results/docker-20260925_113751_9d23b2/simulacao-interclasse/observed.json), [`coverage.json`](../../test-results/docker-20260925_113751_9d23b2/simulacao-interclasse/coverage.json), [`browser-results.json`](../../test-results/docker-20260925_113751_9d23b2/simulacao-interclasse/browser-results.json), [`browser-correction-diagnostics.json`](../../test-results/docker-20260925_113751_9d23b2/simulacao-interclasse/browser-correction-diagnostics.json) e [`events.jsonl`](../../test-results/docker-20260925_113751_9d23b2/simulacao-interclasse/events.jsonl) preservam evidências sanitizadas.

## Cobertura comprovada

- 7 turmas sintéticas × 32 alunos = 224; 2 categorias; 10 modalidades; 35 pares lógicos turma/modalidade; 49 linhas operacionais de equipes, contando 14 equipes individuais; 322 inscrições distribuídas em 140/70/14 alunos com uma, duas ou três modalidades.
- Os 15 jogos coletivos e quatro provas individuais passaram pela interface. Dois mesários operaram em paralelo. Três jogos de uma chave completa (duas semifinais e final) foram disputados offline na mesma aba preparada; a fila IndexedDB sincronizou, os vencedores conferiram e o ID temporário da final foi reconciliado.
- Foram confirmados 313 pontos ativos e um anulado, 400 pontos de esporte, 427 de arrecadação, 35 de penalidades, 827 bruto e 792 líquido. O ranking líquido observado foi: 9EF 156; 6EF 144; 2EMA 124; 8EF 112; 1EMA 100; 7EF 88; 3EMA 68.
- Os 224 alunos autenticaram no portal e conferiram suas 322 inscrições. O primeiro acesso, troca inicial de senha, termos e ondas de inscrição têm cobertura HTTP; a jornada integral de onboarding visual e ações pessoais ainda não foi percorrida na UI.
- A edição recusou inscrições sem CSRF, com CSRF inválido e em equipe de outra turma sem alterar os 322 vínculos. A UI exercitou pausa/retomada, uma correção de ponto e os caminhos online/offline.
- S08 perdeu a resposta depois de commit real de ponto, resultado e ocorrência e repetiu cada operação com a mesma identidade. A arrecadação foi testada pela API e pela UI: o crédito foi comitado antes da perda da resposta, o retry reutilizou a chave e o histórico teve um único efeito. Na integração da mesma edição, payload divergente e reutilização da mesma chave por outro colaborador foram recusados com HTTP 409, sem alterar o histórico. O teste também verificou replay idempotente de estorno.

### Falhas encontradas durante esta continuação

O primeiro gate completo desta rodada, `docker-20260925_090730_64e6f7`, falhou uma vez na correção de ponto da spec `full-interclasse-events.spec.cjs`: após várias jogadas, o botão de anulação do lado perdedor permaneceu desabilitado. O resultado foi preservado em [`simulation-events-playwright.json`](../../test-results/docker-20260925_090730_64e6f7/simulation-events-playwright.json) e o progresso em [`browser-progress.json`](../../test-results/docker-20260925_090730_64e6f7/simulacao-interclasse/browser-progress.json).

A spec foi ajustada para selecionar a duração de 20 minutos do cenário e registrar/anular o ponto equivocado imediatamente após iniciar a partida, antes das demais jogadas. Isso mantém o placar final e o ponto anulado previstos, sem depender de estado acumulado. A evidência sanitizada confirma placar 0→1, cronômetro de 20 min e botão habilitado. A alteração passou nos runs focais [`docker-20260925_102640_8fc54a`](../../test-results/docker-20260925_102640_8fc54a/) e [`docker-20260925_112124_4d295e`](../../test-results/docker-20260925_112124_4d295e/), e no gate completo mais recente acima.

Uma execução focal anterior, `docker-20260925_084524_fcfa47`, também detectou URL relativa inválida em cenário mesário porque `window.SGI_API_BASE` não está definido nessa casca; a spec agora usa o fallback versionado `/api/v1/`. O teste focal subsequente passou.

## Matriz V01–V36 observada

| Estado | Critérios |
| --- | --- |
| Aprovados (13) | V01, V06, V08, V13, V17, V20, V21, V22, V24, V27, V30, V35, V36 |
| Parciais (14) | V02, V05, V09, V10, V12, V14, V15, V16, V18, V19, V26, V28, V29, V31 |
| Não executados (9) | V03, V04, V07, V11, V23, V25, V32, V33, V34 |

Os estados completos e razões estão no `checkpoints.json` do run. Os critérios parciais ainda têm ramos sem prova nesta edição: manifesto com salas adicionais (V02), onboarding visual completo (V05), conflitos de horário (V09–V10), alteração estrutural após liberação (V12), reentrada sem listeners duplicados (V14), limites de bye (V15), recusas de atleta e retificação de pódio individual (V16), validações/estados disciplinares (V18), retificação de resultado individual (V19), disputas concorrentes restantes (V26), revogação/republicação de ranking (V28), mutações depois do encerramento (V29) e cobertura de teclado/responsividade do portal sintético (V31).

Os 9 critérios não executados permanecem como indicado nos checkpoints: importação sintética de 32 alunos (V03), matrícula duplicada por edição (V04), conjunto amplo de limites/elegibilidade (V07), revisão de agenda obsoleta (V11), confirmações HTTP inválidas nesta edição (V23), expiração/renovação de sessão offline nesta edição (V25), falha intermediária com rollback nesta edição (V32), variantes de chaveamento/provas (V33) e comparação de duas execuções normalizadas (V34). V24 está aprovado para crédito: o colaborador repetiu, com o mesmo corpo e chave, a mutação do administrador e recebeu 409; a auditoria confirmou que o histórico e o crédito não mudaram.

## Próximas correções e validações

1. Completar o onboarding pela UI em contextos sequenciais: primeiro acesso, troca de senha, termos, inscrição e isolamento de dados pessoais.
2. Ampliar negativos desta edição para matrícula por edição, limites, gênero/categoria, janela, autorização, edição alheia e revisão obsoleta; provar estado e fila preservados.
3. Exercitar na edição respostas HTTP inválidas, sessão expirada e CSRF atualizado, sem remover mutações pendentes. V24 já tem cobertura de colisão entre operadores para arrecadação; avaliar se é útil ampliar o mesmo cenário a outras rotas.
4. Adicionar cenários concorrentes com barreiras para última vaga, revisão/publicação, ponto versus encerramento, finalização dupla e estorno; observar rollback e ausência de estado parcial.
5. Cobrir variantes suportadas de chaveamento e prova individual. Onde faltar regra esportiva, registrar a decisão de produto em vez de inventar W.O., sets ou suspensão automática.
6. Executar dois bancos limpos com mesmo manifesto/semente e comparar resultados normalizados; testar manifesto com salas adicionais sem mudar a base de 32 alunos por sala.
7. Obter o inventário oficial da escola antes de afirmar aderência ao evento real.
8. Após mudança funcional, executar regressão focal e `tools/test-docker.ps1 -Database mariadb -IncludeVisual`; mudanças SQL seguem a matriz do AGENTS.md.

## Limite de aderência

A competição escolar real não foi fornecida. As sete turmas padrão, modalidades, locais, agenda e regulamento são premissas sintéticas. O teste não comprova que 7 salas/224 alunos representem o evento real, carga de várias escolas nem ausência absoluta de defeitos. Para encerrar essa pendência, faltam a lista oficial de salas e alunos (ou totais anonimizados), modalidades/gêneros/categorias, locais, calendário e regulamento. Não reutilizar base de trabalho nem expor matrículas, senhas, tokens ou cookies.
