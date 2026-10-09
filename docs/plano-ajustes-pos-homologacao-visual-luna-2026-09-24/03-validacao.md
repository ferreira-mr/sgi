# Matriz de aceites e execução

| ID | Cenário e resultado esperado | Camada |
| --- | --- | --- |
| V01 | Final `PL:...:MM:2` concluída com vencedor: árvore e indicador mostram 1 campeão; final pendente/sem vencedor mostra 0. | JS + navegador |
| V02 | Duas modalidades, finais e jogos mistos: campeão contado uma vez por modalidade; modalidade individual respeita ranking confirmado. | JS + integração |
| V03 | Três quartas, uma semifinal e final: 5 jogos reais, 5 concluídos, 0 pendentes; bye/nó virtual não soma. | JS + navegador |
| V04 | Admin e mesário na mesma edição veem cinco resultados no histórico; filtro de modalidade/categoria e reload preservam total correto. | HTTP + navegador |
| V05 | Mesário só lê edição ativa; aluno, anônimo e recurso de outra edição seguem autorização; histórico não permite mutação. | HTTP + integração |
| V06 | Consulta operacional e preparo offline continuam excluindo/selecionando exatamente os estados necessários; jogo encerrado por ID ainda abre para consulta. | Integração + navegador offline |
| V07 | `duracao_jogo` em segundos exibe horas/minutos finitos sob rótulo correto; `null`, inválido, zero e não concluído exibem marcador definido, nunca `NaNmin`. | JS + navegador |
| V08 | Jogar e confirmar resultado, atualizar página, voltar/reentrar e reconectar mantêm placar, campeão, resumo e histórico alinhados sem contagem dupla. | Navegador online/offline |
| V09 | Logout: cancelar preserva sessão; confirmar faz um POST com CSRF e impede URL direta/histórico; GET não encerra. | HTTP + navegador |
| V10 | Logout com rede indisponível, 403 CSRF ou resposta inválida mostra falha e permite tentar novamente, sem navegar falsamente ao login. | JS + navegador |
| V11 | Admin, colaborador, mesário e aluno em desktop e mobile usam o controle **Sair** sem listener duplicado após navegação/reentrada. | Navegador |
| V12 | Segundo e terceiro ciclos de rascunho/publicação antes da liberação continuam concluindo; após liberar, cinco resultados avançam até campeão. | Integração + navegador |
| V13 | Seis equipes: bye e `proximo_jogo_id` seguem regra documentada; partidas reais não são duplicadas, puladas ou pontuadas pelo bye. | Unidade + integração |
| V14 | Datas/horários do mesmo jogo são coerentes entre admin/mesário e com payload; se diferença aparecer, registrar fuso e corrigir com regressão. | Navegador + HTTP |
| V15 | Layout móvel/desktop, contraste/foco e captura visual permanecem corretos após mudanças de rótulo/controle. | Navegador + visual |

Testes devem observar comportamento real, usar fixtures sintéticas e ser descobertos pelos executores atuais. O E2E do cronograma já cobre a final, mas hoje só exige o cartão de campeão; ampliar suas asserções para contadores, histórico, tempo e permissão do mesário. Manter specs que usam SQL no projeto Playwright `database`; não alterar a allowlist `independent`. Não usar tempos arbitrários, limpar IndexedDB pendente nem mascarar falhas por retry/skip.

## Comandos conferidos

Executar os testes relevantes **antes** da edição, repetir as regressões após cada etapa e fazer o gate completo ao final. O runner oficial cria banco/servidor descartáveis para integração e navegador:

```powershell
npm test
composer test:unit
powershell -ExecutionPolicy Bypass -File tools/test-docker.ps1 -Database mariadb -SkipQuality -SkipBrowser
powershell -ExecutionPolicy Bypass -File tools/test-docker.ps1 -Database mariadb -IncludeVisual
git diff --check
```

`-IncludeVisual` é obrigatório se rótulo, template ou aparência mudar; neste plano é provável pela coluna Tempo e pelo controle Sair. Se SQL/schema mudar, complementar com `powershell -ExecutionPolicy Bypass -File tools/test-docker.ps1 -Database mysql -SkipQuality -SkipBrowser` e validar instalação vazia, reaplicação e atomicidade relevante. Não executar `tests/run_all.php`, seed, Playwright ou servidor de testes diretamente sobre banco local. Não fazer push sem gate completo aprovado e CI posterior; push não integra este pacote.

Registrar para cada execução: URL/ambiente, revisão e estado do checkout, comando, horário com fuso, run ID, resultado esperado/observado, falhas e limitações. Relacionar requisições do navegador com status/método/rota e logs sem tokens ou dados pessoais. O runner grava `test-results/docker-<run-id>/run-manifest.json`, `integration-timings.json`, relatórios JSON de navegador/visual e evidências em `tests/browser/test-results/docker-<run-id>/`; anotar apenas arquivos que existirem. A homologação original e seus prints permanecem em `test-results-homologacao-visual-20260924/` como baseline, não como prova dos novos aceites.
