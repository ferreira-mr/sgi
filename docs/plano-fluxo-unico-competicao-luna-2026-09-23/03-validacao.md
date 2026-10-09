# Matriz de regressão e evidências

Os nomes abaixo são cenários a implementar ou mapear a cobertura já existente, não testes declarados aprovados. Cada linha deve ter arquivo/teste, resultado observado e evidência no STATUS. Sucesso HTTP sozinho não comprova persistência, atomicidade ou ausência de duplicatas.

| ID | Cenário e resultado obrigatório | Camadas |
| --- | --- | --- |
| V01 | Quatro turmas/equipes, zero vínculos; preparar, gerar e publicar sem alunos; dois jogos iniciais previstos e uma final | Unidade, integração e navegador |
| V02 | Aluno cadastrado sem inscrição vê horários elegíveis e condicionais antes de escolher; outra turma/categoria/edição não vaza | HTTP e navegador |
| V03 | Inscrição respeita janela, capacidade, versão, três modalidades e conflito inclusive na final | Unidade e HTTP |
| V04 | Publicação incompleta, local inválido e conflito/reserva concorrente recusados sem gravação parcial | Integração e concorrência |
| V05 | Liberação antes de encerrar, revisão antiga e mínimo−1 recusados; mínimo exato aceito | Unidade e HTTP |
| V06 | Liberar cria jogos disponíveis com participantes/horários/locais publicados; fases futuras continuam previstas | Integração e navegador |
| V07 | Falha na segunda criação de um lote deixa zero jogos novos e operação não liberada; dados anteriores intactos | Unidade e integração |
| V08 | Dupla liberação, timeout/reenvio e requisições concorrentes retornam mesmos jogos/partidas | HTTP e concorrência |
| V09 | Dois resultados de semifinal liberam uma final na agenda original; final encerra torneio e pontuação é correta | Unidade, integração e navegador |
| V10 | 3 e 6 entradas, BYE inicial/intermediário; vencedor real avança, sem jogo solo ou escolha por ID | Unidade e integração |
| V11 | Empate/origem pendente não avança; repetição não duplica; correção incompatível com descendente operado preserva histórico | Unidade e integração |
| V12 | Prova individual nasce do planejamento e aceita ranking/créditos; retirada da geração não remove registro legítimo | HTTP e navegador |
| V13 | Pedido direto de geração antiga e demais escritores incompatíveis recusam sem alterar árvore/jogos | HTTP |
| V14 | Administrador/colaborador nas permissões reais; mesário e aluno não geram/liberam; CSRF, sessão e outra edição protegidos | HTTP |
| V15 | Mesma árvore online/offline; final temporária recebe agenda publicada, sincroniza com identidade única e mesmos resultados | JS, integração e navegador |
| V16 | Duas abas, confirmação HTML/JSON inválido, falha parcial e reenvio mantêm fila/ordem/operador; CSRF renovado | JS, IndexedDB e HTTP |
| V17 | Revisão com jogo/resultado/fila existente não recria confronto nem apaga dados; atualização offline incompatível fica revisável | Integração e navegador |
| V18 | Unicidade entre edições/modalidades/publicações; instalação vazia, atualização com dados e repetição, se houver DDL | Integração e matriz SQL |
| V19 | Desktop/mobile, teclado/foco/contraste, raiz/subdiretório, reentrada sem listeners ou ações duplicados | Navegador e visual |
| V20 | Jornada real completa desde zero vínculos até resultado final, sem gerar árvore separada ou chamar API manualmente | Navegador com API real |

## Onde integrar

- Unidade: `tests/Unit/Modules/Competicoes/CronogramaBracketPlannerTest.php`, `CronogramaRulesTest.php`, `ChaveamentoControllerTest.php`, `ChaveamentoServiceTest.php`, `ResultadoServiceTest.php` e novos testes de caso de uso necessários.
- Integração: `tests/Integration/CronogramaPlanejadoTest.php`, `ConcurrentInvariantsTest.php`, `ConcurrentScheduleTest.php`, `IndividualSyncCreditTest.php` e suites pertinentes encontradas em U00. Registrar novos cenários em `tests/run_all.php` se esse for o mecanismo atual.
- Navegador: `tests/browser/cronograma-planejado.spec.cjs`, `aluno-portal.spec.cjs`, `individual-ranking.spec.cjs`, `offline-tournament-bracket.spec.cjs`, `tournament-offline.spec.cjs`, `offline-queue-regression.spec.cjs` e `visual-contract.spec.cjs`.
- JS: localizar os testes do engine/projeções pelo `package.json` e cobertura atual. Usar IndexedDB real no spec de fila; testes puramente em memória não o substituem.

Não aumentar a allowlist do projeto Playwright `independent`: a jornada depende de banco/sessão e pertence ao projeto apropriado com serialização prevista no AGENTS.

## Comandos conferidos no momento da elaboração

Na raiz do projeto, com dependências já preparadas conforme README:

```powershell
php vendor/bin/phpunit --configuration phpunit.xml --filter 'Cronograma|Chaveamento|Resultado|Inscricao'
npm test
npm --prefix tests/browser run test:offline-queue
powershell -ExecutionPolicy Bypass -File tools/test-local.ps1 -Suite quality
```

Os comandos acima são focais/qualidade, não aprovação completa. Baseline e entrega da refatoração usam a bateria completa. O executor Docker não possui argumento `-Suite`; sem skips executa o perfil completo:

```powershell
powershell -ExecutionPolicy Bypass -File tools/test-docker.ps1 -Database mariadb -IncludeVisual
```

Alternativa pelo executor local, também com banco descartável:

```powershell
powershell -ExecutionPolicy Bypass -File tools/test-local.ps1 -Suite all -Database mariadb -IncludeVisual
```

Se houver SQL/migrações específicos, seguir a exigência atual de matriz do AGENTS e executar também MySQL, sem tratar evidência MariaDB como equivalente:

```powershell
powershell -ExecutionPolicy Bypass -File tools/test-docker.ps1 -Database mysql -IncludeVisual
```

No Linux/macOS, equivalente completo: `sh tools/test-docker.sh --database mariadb --include-visual`; trocar para `--database mysql` quando aplicável. Revalidar flags no início, pois há alterações preexistentes nos executores.

Não executar integração, Playwright com SQL, seed ou reset diretamente contra a base local. Não alterar `.env`, usar servidor de desenvolvimento em 8080 como teste, inventar variáveis de conexão nem desativar `TestDatabaseSafety`. Pré-requisito ausente ou Docker inacessível é bloqueio de execução, não aprovação parcial.

## Evidência mínima

Registrar comando exato, início/fim com fuso, revisão e estado do checkout, run ID, ambiente/URL descartável, cenário, esperado/observado, exit code e caminhos reais. Vincular `run-manifest.json`, logs de aplicação/HTTP/teste, JSON/HTML do Playwright, trace/screenshot e `integration-timings.json` conforme produzidos pelo runner; não inventar nomes de arquivos ausentes.

Relacionar falha do navegador ao request/horário/rota nos logs. Sem senhas, tokens, payloads com dados pessoais ou SQL sensível. Não sobrescrever evidências de um perfil com outro. CI remoto fica “não executado” sem run remoto comprovado.

Para esta entrega apenas documental: conferir links, caminhos, flags e executar `git diff --check`. Nenhuma suíte funcional é exigida para escrever o roteiro e nenhuma aprovação funcional é inferida dessa checagem.
