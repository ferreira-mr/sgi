# Matriz de testes e evidências

## Comandos verificados nos executores atuais

Executar na raiz. O wrapper Docker completo não aceita `-Suite`; ele executa a bateria integral por padrão. Não usar `-SkipQuality` ou `-SkipBrowser` como evidência final.

```powershell
# Baseline e entrega completa com visual, PHP 8.4 padrão
powershell -ExecutionPolicy Bypass -File tools/test-docker.ps1 -Database mariadb -IncludeVisual

# Segundo motor para schema/SQL desta implementação
powershell -ExecutionPolicy Bypass -File tools/test-docker.ps1 -Database mysql -IncludeVisual

# Qualidade sem SQL, durante desenvolvimento
powershell -ExecutionPolicy Bypass -File tools/test-local.ps1 -Suite quality

# Perfis focados, ainda com banco em container descartável
powershell -ExecutionPolicy Bypass -File tools/test-local.ps1 -Suite integration -Database mariadb
powershell -ExecutionPolicy Bypass -File tools/test-local.ps1 -Suite browser -Database mariadb

# Alternativa completa com runtimes locais e SQL descartável
powershell -ExecutionPolicy Bypass -File tools/test-local.ps1 -Suite all -Database mariadb -IncludeVisual

git diff --check
```

Não executar runner HTTP, seeds ou Playwright isoladamente contra SQL local. Filtros mais estreitos só dentro de ambiente preparado pelo executor oficial e documentado em `docs/testing.md`; não inventar flags dos wrappers. Não usar desenvolvimento em 8080 como teste automatizado. Não resetar dados reais.

## Onde colocar os testes

Estender os testes existentes antes de criar suítes paralelas:

- Unitários: `tests/Unit/Modules/Participantes/InscricaoRulesTest.php`, `InscricaoServiceTest.php`; `tests/Unit/Modules/Competicoes/ModalidadeServiceTest.php`, `EquipeRosterRulesTest.php`, `EquipeCapacityRulesTest.php`, `ChaveamentoRulesTest.php`, `AgendamentoBlocoSchedulerTest.php`, `AgendamentoSequencialSchedulerTest.php`.
- Integração: `tests/Integration/InscricaoModalidadesTest.php`, `ModalidadesAndEquipesTest.php`, `AgendamentoBlocoTest.php`, `AgendamentoSequencialTest.php`, `MigrationsTest.php`, `MigrationSupportTest.php` e `RecoveryRehearsalTest.php`.
- Navegador: `tests/browser/aluno-portal.spec.cjs`, `agenda-sequencial.spec.cjs`, `individual-ranking.spec.cjs`, `e06-agenda-accessibility.spec.cjs` e `offline-queue-regression.spec.cjs`.
- Novos testes de casos de uso seguem namespaces existentes. Integração nova precisa ser registrada no runner `tests/run_all.php`; uma classe não registrada não representa cobertura executada. Testes JS devem ser descobertos pelo comando atual de `package.json`.

## Casos obrigatórios

| ID | Cenário e resultado observável | Camadas |
| --- | --- | --- |
| V01 | Quantidade vazia/zero/negativa/fracionária/overflow recusada; mínimo > máximo recusado; toda modalidade exige configuração finita. | Unitário + HTTP |
| V02 | Três turmas × duas entradas gera seis; repetição e concorrência mantêm mesmos IDs; falha intermediária desfaz criação parcial. | Unitário + SQL |
| V03 | Turma, modalidade, recurso, nó ou equipe de outra edição/categoria são recusados. | Unitário + HTTP/SQL |
| V04 | Equipes vazias permitem planejamento, mas não início de jogo/WO/avanço/pontos. | Unitário + HTTP + navegador |
| V05 | Mata-mata com 3/4/6/8 entradas produz 2/3/5/7 confrontos reais; BYEs não consomem horário nem inventam resultado. | Unitário + SQL |
| V06 | Final planejada sem participantes tem reserva e candidatos alcançáveis; sorteio não muda ao reagendar. | Unitário + HTTP |
| V07 | Prova individual agenda vagas sem atletas; após inscrição, classificação usa os participantes reais corretos. | SQL + navegador |
| V08 | Duas categorias no mesmo recurso/horário conflitam; em recursos distintos, sem pessoas em comum, são permitidas. | Unitário + HTTP |
| V09 | Descanso, transição, pausas, recursos permitidos, precedência e fim da janela respeitados; grade insuficiente retorna pendências. | Unitário + HTTP |
| V10 | Publicar sem final/horário/configuração completa falha; abrir antes de publicar falha; falha transacional não abre inscrições. | HTTP/SQL |
| V11 | Antes da abertura, exatamente no encerramento e durante revisão não inscreve; fuso/relógio do servidor prevalecem. | Unitário + HTTP |
| V12 | Inscrição na equipe 2 grava nela; lotação por equipe não usa vagas da equipe 1; duplicata não ocupa vaga; segunda equipe da mesma modalidade exige transferência. | HTTP/SQL + navegador |
| V13 | Mantém limite de três modalidades, gênero, categoria, turma, termos, primeiro acesso, sessão revalidada e CSRF. | Unitário + HTTP |
| V14 | Sobreposição total/parcial e contenção conflitam; adjacência com margem zero permite; deslocamento necessário bloqueia; dias distintos permitem. | Unitário + HTTP |
| V15 | Conflito só entre finais possíveis bloqueia; ramo inalcançável não bloqueia; BYE e eliminação real projetam corretamente compromissos. | Unitário + HTTP + navegador |
| V16 | Duas escolhas novas conflitantes, ou uma inválida, causam zero inserções; falha após primeira escrita faz rollback total. | HTTP/SQL |
| V17 | Dois clientes disputando última vaga: exatamente um sucesso; chamadas simultâneas do mesmo aluno não ultrapassam limite/nem criam conflito. | Concorrência SQL/HTTP |
| V18 | Publicação/edição manual versus inscrição: operação observa versão válida serializada ou retorna 409; nunca confirma agenda obsoleta. | Concorrência SQL/HTTP |
| V19 | Transferência inválida conserva origem; inclusão e redistribuição administrativas aplicam mesmas regras. | HTTP/SQL |
| V20 | Revisão conserva snapshot anterior e histórico; bloqueia conflitos; retirada não apaga resultado/inscrição; início impede regeneração destrutiva. | HTTP/SQL + navegador |
| V21 | Aluno/mesário não preparam/publicam/abrem; colaborador não adquire privilégio de administrador; acesso direto não contorna controles. | HTTP |
| V22 | Instalação vazia, instalação + migrate, upgrade com vínculos/resultados, repetição e falha/recuperação preservam dados e checksums. | MariaDB + MySQL |
| V23 | IDs e reserva de final permanecem coerentes após avanço online/offline; replay não duplica jogo, pontos ou confirmação. | SQL + JS + Playwright |
| V24 | Fila pendente e cache existente sobrevivem a atualização; operações novas online não são enfileiradas; erro de sync permanece revisável. | JS + Playwright |
| V25 | Fluxo completo, teclado/mobile, raiz/subdiretório, reentrada, duplo clique, versão obsoleta e erros legíveis. | Navegador + visual |


Testes concorrentes devem coordenar operações por barreiras/sinais confiáveis do harness; não depender de atrasos arbitrários. Asserir persistência final e respostas, não apenas presença de métodos/campos.

## Cenário sintético de homologação

Criar edição própria com duas categorias, três e quatro turmas, sem cabo de guerra. Usar futsal com uma equipe por turma, tênis de mesa com uma dupla, xadrez com duas entradas individuais em mata-mata e uma prova individual por marcas. Não assumir quantidades/configuração do evento real como fixtures de produção.

1. Preparar sem alunos e gerar todas as fases; confirmar ausência de confrontos entre categorias.
2. Mostrar falta de janela, corrigir recursos/horários e publicar.
3. Abrir inscrições; confirmar uma combinação compatível e recusar conflito direto e conflito somente na final.
4. Disputar última vaga, transferir aluno e testar versão obsoleta.
5. Encerrar, resolver equipe incompleta e liberar operação.
6. Preparar mesário online, desligar rede no Playwright na mesma aba, operar e sincronizar; conferir reserva da fase seguinte e pontuação consistente.
7. Revisar horário de jogo futuro e comprovar relatório de impacto/publicação, sem perda de fila pendente.

## Evidências e critérios de saída

Registrar em STATUS: data/hora com fuso, commit, ambiente/URL isolada, comando exato, exit code, cenários, contagens, logs e limitações. Os wrappers escrevem em `test-results/`, `tests/browser/test-results/` e `tests/browser/playwright-report/`, com subdiretórios por execução; registrar os caminhos reais retornados, sem inventá-los.

Correlacionar execução, navegador, rota/status e log interno por identificador disponível. Não registrar senhas, CSRF, payloads pessoais ou SQL sensível. Capturas visuais usam dados sintéticos. Inspecionar imagens antes de atualizar qualquer referência intencional, preservando plataforma.

Baseline lido não é baseline executado. Teste escrito não é teste aprovado. Perfil focado não é suíte completa. Execução local não comprova CI remoto. Não marcar T09 concluída com falhas preexistentes, testes omitidos ou ausência de Docker como se fossem aprovação.

## Validação deste pacote documental

A criação deste roteiro é exclusivamente documental: conferir caminhos, links, comandos e `git diff --check`. Não executar banco, build ou suíte de produto apenas para validar estes textos. A obrigação das suítes acima começa na implementação funcional, conforme AGENTS.
