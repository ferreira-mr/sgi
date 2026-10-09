# 04 — Matriz de aceite e evidências

Todos os itens começam **não executados**. Cada resultado deve indicar execução, caso, comando, ambiente, revisão, horário/fuso, esperado, observado e artefatos. `Aprovado`, `parcial`, `falhou`, `bloqueado` e `não executado` são estados diferentes. Um item só fica aprovado quando todas as verificações descritas nele têm evidência; cobertura positiva de uma etapa com ramos pendentes fica parcial. Limite de produto documentado não equivale a comportamento implementado.

## Matriz obrigatória

| ID | Cenário | Verificação observável / aceite | Camada |
| --- | --- | --- | --- |
| V01 | Isolamento | Runtime container, saúde da mesma base, URL própria, nenhuma alteração externa | Runner/HTTP |
| V02 | Configuração integral | 7 turmas, 224 alunos, 2 categorias, 10 modalidades, 35 pares lógicos e 49 linhas operacionais (14 vagas individuais separadas); manifesto adicional não perde salas | HTTP/SQL de leitura |
| V03 | Importação | PDF sintético com 32 alunos, erros sem carga parcial indevida, reimportação sem duplicação | UI/HTTP |
| V04 | Matrícula por edição | Duplicata na mesma edição recusada; outra edição permitida | HTTP |
| V05 | Autenticação/termos | 224 logins e aceites; troca inicial quando exigida; ações bloqueadas antes dos pré-requisitos | HTTP/UI |
| V06 | Inscrição integral | 224 → 308 → 322 vínculos nas ondas; 140/70/14 alunos com 1/2/3 modalidades | HTTP/UI |
| V07 | Limites e elegibilidade | Vagas, quarta modalidade, gênero, categoria, edição, janela e termos conferidos independentemente | Unitário/HTTP/UI |
| V08 | Sessões estudantis | Um aluno não inscreve nem consulta dados restritos de outro; CSRF ausente/inválido recusado | HTTP |
| V09 | Agenda integral | 15 confrontos, 4 provas, byes distintos; locais/horários/descanso e candidatos futuros sem colisões | HTTP/UI |
| V10 | Revisão com inscritos | 2ª/3ª publicação preservam 322 vínculos; horários separados aceitos; conflito real recusado | HTTP/UI |
| V11 | Tela/revisão antiga | Atualização e reconferência sem inscrição em agenda obsoleta; versão antiga não ocupa calendário ativo | HTTP/UI |
| V12 | Liberação | Pré-condições, materialização única, repetição sem duplicação, alteração estrutural posterior recusada | HTTP/UI |
| V13 | Todas as partidas | 15 confrontos operados; pontos ativos fecham placar e têm atleta/equipe/jogada/autoria corretos | HTTP/UI/SQL de leitura |
| V14 | Placar e tempo | Início/pausa/retomada, anulação, persistência e reentrada sem listeners/eventos duplicados | UI/JavaScript |
| V15 | Progressão | Vencedores e próximos participantes corretos; bye sem ponto; terceiro derivado; sem jogo solo de campeão | Unitário/HTTP/UI |
| V16 | Individual | 4 provas e 28 participações; pódio válido, atleta repetido/não inscrito recusado, créditos corretos | HTTP/UI |
| V17 | Arrecadação | 7 históricos, fração/estorno/reversão, soma final 427 e recusa de estorno duplicado | HTTP/UI |
| V18 | Disciplina | Tipos suportados, edição/valor/estado, edição/anulação, total ativo 35 descontado uma vez | HTTP/UI |
| V19 | Correções esportivas | Deltas de final e individual, crédito antigo substituído; recusa atômica quando estado não permite | Unitário/HTTP/UI |
| V20 | Offline real | Mesma aba preparada, semifinais/final, IndexedDB real e servidor sem confirmação antecipada | UI/backend real |
| V21 | Reconexão | Dependências preservadas, IDs temporários quando aplicáveis, fila converge e efeitos são únicos | UI/HTTP |
| V22 | Resposta perdida | Commit real antes da perda; replay confirma sem duplicar ponto/ocorrência/fase/crédito | UI/HTTP |
| V23 | Confirmação inválida | HTML/JSON inválido/erro em HTTP 200 não removem item nem fingem sucesso | UI/JavaScript |
| V24 | Identidade da mutação | Mesma chave/payload retorna resultado coerente; payload/operador diferente é recusado | HTTP/UI |
| V25 | Sessão offline | CSRF atualizado, expiração/revogação/troca de operador sem vazamento nem descarte da fila | HTTP/UI |
| V26 | Concorrência | Última vaga, publicação, ponto/finalização, estorno e dupla aba com resultado único e sem estado parcial | HTTP/barreiras/UI |
| V27 | Ranking por origem | Valores por turma, pódio, arrecadação, ajuste, penalidades e líquido conferidos; 827 bruto / 792 líquido | Oráculo/HTTP/UI |
| V28 | Publicação por perfil | Antes/depois/revogação; aluno/público não recebem ranking reservado; caminho correto de consulta | HTTP/UI |
| V29 | Encerramento | Histórico íntegro, mutações indevidas recusadas, edição ativa trocada sem afetar edição antiga | HTTP/UI |
| V30 | Consulta final | 224 alunos conferem turma/inscrições/resultado permitido; sete posições de turma reconciliadas | HTTP/UI |
| V31 | Navegação/dispositivos | Celular/desktop, teclado nos fluxos centrais, retorno perfil e casca offline, erros de console correlacionados | UI |
| V32 | Rollback | Falha intermediária não deixa resultado sem pontos, avanço sem resultado ou crédito sem origem | Integração/falha controlada |
| V33 | Variantes | 2/3/4/5/8 equipes, campeão com bye, menos de 3 atletas e múltiplas equipes por turma explicitamente avaliados | Unitário/HTTP |
| V34 | Repetibilidade | Mesmo manifesto/semente gera mesmos resultados normalizados em duas execuções limpas | Runner/oráculo |
| V35 | Descoberta e relatório | Gate oficial executa novo cenário; erro reprova exit code; falha exporta evidência antes da limpeza | Runner |
| V36 | Oráculo confiável | Pequenos casos calculados manualmente detectam erro de sinal, arredondamento, duplicação e beneficiário | Unitário |

V33 não exige que toda variante seja aceita pela aplicação: exige comprovar a resposta correta e íntegra para o contrato suportado. Regras novas de W.O., sets, pênaltis, suspensões automáticas ou fases classificatórias não podem ser implementadas silenciosamente como auxiliares de teste. Documentar requisitos faltantes e abrir decisão de produto quando necessário.

## Execução futura — comandos existentes

Comandos conferidos nos scripts atuais; a implementação deve conferir novamente os parâmetros antes de executar. `tools/test-docker.ps1` executa o gate completo por padrão e **não recebe `-Suite`**. O seletor `-Suite` pertence a `tools/test-local.ps1`, que também cria banco em container.

```powershell
# Qualidade, sem banco
powershell -ExecutionPolicy Bypass -File tools/test-local.ps1 -Suite quality

# Integração focal por perfil, ainda com banco descartável
powershell -ExecutionPolicy Bypass -File tools/test-local.ps1 -Suite integration -Database mariadb

# Navegador com integração de preparação
powershell -ExecutionPolicy Bypass -File tools/test-local.ps1 -Suite browser -Database mariadb

# Diagnóstico focal: simulação HTTP e 224 jornadas de leitura no portal
powershell -ExecutionPolicy Bypass -File tools/test-docker.ps1 -Database mariadb -SimulationOnly -SkipQuality

# Apenas o roteiro HTTP, sem Playwright
powershell -ExecutionPolicy Bypass -File tools/test-docker.ps1 -Database mariadb -SimulationOnly -SkipQuality -SkipBrowser

# Gate completo Docker, incluindo contrato visual para esta entrega
powershell -ExecutionPolicy Bypass -File tools/test-docker.ps1 -Database mariadb -IncludeVisual

# Compatibilidade adicional obrigatória se houver mudança específica de SQL/migração
powershell -ExecutionPolicy Bypass -File tools/test-docker.ps1 -Database mysql -IncludeVisual
```

Alternativa Linux/macOS para o gate: `sh tools/test-docker.sh --database mariadb --include-visual`. Para feedback de unidade/JS sem SQL, usar `composer test:unit`, `npm test` e `npm --prefix tests/browser run test:offline-queue`, conforme escopo.

Não executar `php tests/run_all.php`, Playwright com banco, seed ou servidor de testes soltos. Não criar host/credenciais SQL locais de teste. Não usar `-SkipQuality` ou `-SkipBrowser` como aprovação completa. Não usar `-Keep` para transformar o gate em ambiente manual sem solicitação explícita.

`-SimulationOnly` executa as fases `prepare → browser-simulation-events → finalize → browser-simulation` em Compose descartável. Preparação, os 15 jogos e quatro pódios pela UI, reconciliação e portal de 224 alunos compartilham a mesma edição e banco, sem reset intermediário. O seletor interno `SGI_TEST_INTEGRATION_SCENARIO=FullInterclasseSimulationTest` é configurado pelo runner. O gate completo roda primeiro integração, browser e visual gerais; depois limpa a base descartável, reaplica migrações e inicia a simulação. Um modo focal não substitui o gate completo.

Na execução validada, todos os 15 jogos foram operados pela UI e os quatro pódios registrados pela interface. Dois mesários trabalharam em paralelo em modalidades distintas; três jogos de uma chave completa foram feitos offline na mesma aba preparada, e a final com ID temporário foi reconciliada. O servidor confirmou o commit antes da perda da resposta para ponto, resultado e ocorrência; os retries reutilizaram a identidade e não duplicaram efeitos. Crédito de arrecadação teve o mesmo ensaio pela UI e pela API, com efeito único; replay de estorno foi verificado na integração. Payload divergente para ocorrência/crédito e chave de crédito reapresentada por outro operador foram recusados com HTTP 409. A edição também recusou tentativas de inscrição sem CSRF, com CSRF inválido e em equipe de outra turma sem alterar as 322 inscrições, e operou pausa/retomada do cronômetro. `coverage.json` registra cada origem separadamente. A operação de todos os jogos pela UI levou cerca de 9,2 minutos; o gate completo mais recente levou 28 min 08,533 s.

V22 está aprovado para ponto, ocorrência, resultado/avanço e crédito de arrecadação na edição sintética. V24 também está aprovado para colisão de chave entre operadores no crédito de arrecadação. Permanecem separados V23 e V25: respostas HTTP inválidas, sessão expirada e renovação de CSRF ainda precisam de cenários explícitos nesta edição.

## Estado observado em 25/09/2026

O gate completo mais recente, `docker-20260925_113751_9d23b2`, foi executado das 08:37:51 às 09:06:00 (America/Sao_Paulo), com exit code 0, em PHP 8.4 e MariaDB descartável. Passaram qualidade, PHPUnit (394 testes, 2.718 asserções e uma depreciação), integração (1.081 asserções), navegador geral (173/173), contrato visual (2/2), checkpoints S00–S12 e simulação contínua. Não houve retry/flaky. Duração total: 1.688,533 s (28 min 08,533 s). O runner removeu o container e o volume ao final. O comando executado foi `powershell -ExecutionPolicy Bypass -File tools/test-docker.ps1 -Database mariadb -IncludeVisual`.

Na edição sintética: 224 alunos, 322 inscrições, 15 jogos, quatro provas, 313 pontos ativos e um anulado; arrecadação 427, pontuação esportiva 400 e penalidades 35; ranking bruto 827 e líquido 792. Os 15 jogos e quatro provas passaram pela interface; a chave offline incluiu duas semifinais e final, reconciliou o ID temporário e deixou a fila confirmada. Perda e replay depois do commit de ponto, resultado, ocorrência e crédito preservaram a identidade e não duplicaram efeitos. O colaborador que tentou reaproveitar a chave do crédito do administrador recebeu HTTP 409; o histórico permaneceu igual ao observado depois do commit original. Inscrições sem CSRF, com CSRF inválido e em equipe de outra turma foram recusadas sem alterar os 322 vínculos. A spec do portal autenticou 224 alunos e conferiu 322 inscrições. O relatório de simulação registrou 1.778 eventos HTTP e nenhuma falha.

A matriz registrada no [`checkpoints.json`](../../test-results/docker-20260925_113751_9d23b2/simulacao-interclasse/checkpoints.json) tem 13 critérios aprovados (V01, V06, V08, V13, V17, V20, V21, V22, V24, V27, V30, V35 e V36), 14 parciais (V02, V05, V09, V10, V12, V14, V15, V16, V18, V19, V26, V28, V29 e V31) e 9 não executados (V03, V04, V07, V11, V23, V25, V32, V33 e V34). O primeiro gate completo da rodada (`docker-20260925_090730_64e6f7`) falhou na correção de ponto; a ordem da correção foi estabilizada e o gate posterior passou, mantendo ambas as evidências. O cenário é sintético: os dados reais da escola não foram fornecidos. Consulte [STATUS.md](STATUS.md) para as pendências e os artefatos do run.

## Evidências mínimas

No diretório proposto `test-results/<execucao>/simulacao-interclasse/`, produzir:

- `manifest-resolved.json`: versão/hash, semente, relógio-base, aliases e configuração efetiva, sem segredos.
- `expected.json` e `observed.json`: turmas/alunos/inscrições, árvore, placares, pódios, eventos e reconciliação por origem.
- `events.jsonl`: eventos correlacionados por execução, fase, ator sintético e recurso; método/rota, status, duração e assert correspondente.
- `checkpoints.json`: esperado/observado em S00–S12, incluindo etapas bloqueadas e matriz V01–V36.
- `coverage.json`: quantos alunos/turmas/modalidades/confrontos foram realmente exercitados por UI e por API; não somar execução repetida como aluno novo.
- `report.md`: resultado legível, campeões por categoria/modalidade, posição das sete turmas, achados, comandos, versão, ambiente, horários, limites e links para evidências.

Reutilizar `run-manifest.json`, `integration-timings.json`, JSON/HTML do Playwright, screenshots e traces já produzidos. Conferir nomes e diretórios efetivos do runner, pois cada execução tem caminhos próprios. Associar `event_id`/fase ao request-id quando disponível; caso contrário, correlacionar horário, rota e recurso sintético sem afirmar identificador que o servidor não emite.

Capturas mínimas: edição preparada, calendário publicado, inscrição com 1/2/3 modalidades, segunda publicação com vínculos preservados, placar online, placar/fila offline, árvore após reconexão, corrida, ocorrência, arrecadação e classificação publicada. Um trace por falha deve permitir localizar ação e resposta; não salvar corpo de login, senha, cookie, token CSRF ou exportação de fila com credenciais. Sanitizar logs/artefatos e controlar retenção, inclusive traces que possam conter entradas sensíveis.

## Regra de aprovação

A implementação só está validada quando E00–E09, S00–S12 e a matriz aplicável têm evidências, o gate completo passa e o cenário é reproduzível. Uma falha encontrada no produto exige relato e regressão; não diminuir população, desativar modalidade, ignorar operação recusada, remover asserção, criar skip ou atualizar snapshot para fabricar aprovação.

Não apresentar aprovação local como aprovação do CI remoto. Antes de push autorizado, executar a bateria completa exigida pelo AGENTS e aguardar os checks remotos pertinentes. Este plano não solicita push.
