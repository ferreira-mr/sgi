# Matriz de validação futura

**Nenhum cenário abaixo foi executado nesta auditoria.** A instrução atual do usuário proíbe a execução dos testes automatizados agora. Os comandos são referência para uma implementação posterior; a presença deste arquivo não revoga aquela instrução.

| ID | Cenário e resultado esperado | Camadas / achados |
| --- | --- | --- |
| V01 | Publicar duas modalidades, inscrever o mesmo aluno em ambas sem sobreposição, revisar e republicar duas vezes; manter inscrições e horários | Regra, integração HTTP, navegador; D01 |
| V02 | Mesmo aluno em dias diferentes é aceito; horários sobrepostos, inclusive fase condicional, recusam publicação sem gravação parcial | Regra e integração; D01 |
| V03 | Publicar/abrir e salvar configuração idêntica: nenhuma suspensão, mudança de versão ou perda da janela | HTTP e persistência; D02 |
| V04 | Liberar e tentar criar/alterar planejamento: recusa sem alterar estado, nós, jogos, resultados ou fila; incluir chamada direta e concorrente | Integração e jornada; D02 |
| V05 | Gerar numa aba, mudar configuração em outra durante rascunho/revisão; proposta antiga recusada e regeneração orientada | HTTP e navegador; D02, D07 |
| V06 | Publicado/fechadas não oferece liberação prematura; permite encerrar sem abrir nova janela e então liberar com elencos válidos | HTTP e navegador; D04 |
| V07 | Encerramento inválido em rascunho/revisão não cria estado sem saída; repetir abrir/encerrar válido permanece idempotente | Integração; D04 |
| V08 | Aumentar/reduzir quantidade e alterar limites exige preparo atual; geração/publicação abrangem o mesmo conjunto elegível de equipes/turmas | Integração; D07 |
| V09 | Redução com inscritos/histórico é recusada; inativação de turma/categoria segue política explícita sem grade incompleta silenciosa | Integração; D07 |
| V10 | Rascunho aparece com horário/local/equipes e fase antes de publicar; pendências aparecem sem habilitar Publicar | Navegador com API real; D03 |
| V11 | Segunda publicação muda data/horário visível; Atualizar reconcilia; liberar não duplica eventos nem omite compromissos futuros | Navegador; D03 |
| V12 | POST confirmado + GET/grade falha: informar atualização pendente, preservar estado recuperável e não duplicar mutação | JS e navegador; D03 |
| V13 | Janela futura, aberta, expirada, fechada e suspensa aparecem corretamente; início inclusivo/fim exclusivo e fuso consistente | Regra, HTTP, navegador; D05 |
| V14 | Reabrir painel mostra janela persistida; alterações locais não são sobrescritas por resposta atrasada | Navegador; D05 |
| V15 | Portal aberto durante republicação preserva intenção, exibe nova agenda e exige nova revisão antes de enviar a versão atual | HTTP e navegador; D05 |
| V16 | Do perfil, desktop/celular, chegar às inscrições por texto visível; termos pendentes orientam aceite; nenhuma URL digitada pelo teste | Navegador e visual; D06 |
| V17 | Salvar primeira modalidade, voltar depois e adicionar segunda/terceira compatíveis; quarta, lotação e conflito verdadeiro continuam recusados | HTTP e navegador; D01, D06 |
| V18 | Reserva/jogo criado após gerar impede publicação; corrida concorrente deixa no máximo uma ocupação válida e nenhuma publicação parcial | Integração/concorrência; D08 |
| V19 | Histórico de publicação substituída não bloqueia vaga liberada; publicação vigente e reserva independente continuam bloqueando | Integração; D08 |
| V20 | Reserva 08:00–08:05, margem 10, duração 20, janela até 08:35 encontra 08:15–08:35; testar limites e múltiplos locais | Algoritmo e integração; D09 |
| V21 | Administrador/colaborador autorizados; aluno/mesário recusados nas mutações; CSRF, edição, sessão, categoria e gênero preservados | HTTP |
| V22 | Depois da última revisão: liberar, operar jogos, avançar fases offline na aba preparada e sincronizar uma única vez preservando calendário | Navegador real e integração |
| V23 | Raiz/subdiretório, reentrada sem listeners duplicados, foco, teclado, mensagens acessíveis e layout responsivo | JS, navegador, visual |

## Dados de cenário

Usar ambiente descartável dos runners oficiais, uma edição sintética com duas ou três modalidades compatíveis e alunos que participam de mais de uma modalidade. Primeiro inscrever, **depois** repetir a publicação. Não usar somente equipes vazias, um aluno distinto por equipe ou uma modalidade no cenário principal de repetição.

Asserções precisam verificar horários, participantes, vínculos e versão persistida, além de badge/sucesso HTTP. Testes com respostas controladas são úteis para falhas de rede e interação, mas não substituem a jornada com APIs reais. As regressões devem ser descobertas pelos executores existentes.

## Comandos para quando a execução for permitida

Conferidos por leitura de `tools/test-docker.ps1` e `docs/testing.md`; não executados nesta rodada:

```powershell
composer test:unit
npm test
powershell -ExecutionPolicy Bypass -File tools/test-docker.ps1 -Database mariadb -SkipQuality -SkipBrowser
powershell -ExecutionPolicy Bypass -File tools/test-docker.ps1 -Database mariadb -IncludeVisual
# Para SQL/locks alterados, validar também o motor MySQL:
powershell -ExecutionPolicy Bypass -File tools/test-docker.ps1 -Database mysql -SkipQuality -SkipBrowser
git diff --check
```

O gate completo inclui qualidade, build, JS, integração, navegador e visual com `-IncludeVisual`. Não rodar integração, Playwright ou seeds diretamente no banco local/de homologação dos alunos. Não fazer reset de base de trabalho nem limpar IndexedDB para obter aprovação.

## Evidências e correlação

Registrar em STATUS versão/checkout, comando, início/fim com fuso, URL isolada, run ID e resultado por camada. O runner grava `test-results/docker-<run-id>/run-manifest.json`, `integration-timings.json`, `browser-playwright.json` e, quando selecionado, `visual-playwright.json`. Conferir os arquivos existentes antes de declarar resultados. Evidências de navegador ficam em `tests/browser/test-results/docker-<run-id>/`.

Correlacionar falha por cenário, horário, método/rota, revisão enviada/atual, código HTTP e log interno. Registrar motivo estruturado para transição recusada, conflito real e proposta obsoleta. Não incluir tokens, cookies, senhas, matrícula ou nomes reais. Aprovação anterior ou local não comprova CI remoto nem versão implantada.
