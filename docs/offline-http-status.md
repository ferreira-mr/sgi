# Status da implementação offline HTTP

Registro iniciado em 08/09/2026; verificações desta revisão atualizadas em 23/09/2026 (UTC).

As medições e comandos antigos abaixo são históricos. Para executar a suíte atual,
use os procedimentos de [testes](testing.md); esta página não é o guia operacional.

## Concluído nesta entrega

- O navegador agora distingue `navigator.onLine` do servidor SGI local por uma sondagem do endpoint `/api/v1/health`, sem consultar a internet.
- Ao preparar o modo offline ou retomar a sincronização, o cliente confirma também `/api/v1/session`; sessão expirada fica separada de servidor indisponível e não dispara reenvio cego.
- A sondagem usa `cache: no-store`, valida JSON (`success`, `status` e `service`) e possui timeout próprio. A resposta PHP também envia `Cache-Control: no-store` e `Pragma: no-cache`.
- O endereço da sondagem acompanha instalações em subdiretório (`SGI_BASE_PATH`) usando a origem do asset carregado.
- GETs e reenvios de mutações possuem timeout; uma falha mantém a intenção na fila.
- Sincronizações concorrentes na mesma origem/operador usam uma reserva transacional no banco IndexedDB auxiliar `sgi_offline_coord`, com expiração e fallback seguro quando esse banco não pode ser aberto.
- BroadcastChannel avisa outras abas sobre mudança da fila e servidor recuperado; a exclusão mútua não depende do canal.
- O estado público inclui servidor acessível/indisponível e erro de diagnóstico.
- A casca exige páginas obrigatórias com `schemaVersion` e `pageSources` para mostrar “pronto para offline”; uma agenda isolada ou uma marca antiga não é suficiente.
- A fila pode ser exportada para JSON sem cookies, senhas ou tokens CSRF. O arquivo preserva as identidades das mutações, rejeita importação de outro operador e pode ser importado pelo próprio banner offline.

## Validação

Em 08/09/2026, uma revisão anterior registrou `npm run check`, `npm test`, testes de navegador direcionados e uma suíte de 47 casos. Essa evidência é histórica: a suíte `legacy-offline-compat.spec.cjs` foi removida na migração para rotas versionadas e os comandos antigos não representam o inventário atual.

Na revisão de 23/09/2026, `npm --prefix tests/browser run test:offline-queue` passou com 27/27 casos, incluindo falha de rede com retenção da mutação e reenvio da mesma identidade. A execução completa foi `powershell -ExecutionPolicy Bypass -File tools/test-docker.ps1 -Database mariadb`: `all` passou em 558,729 s, com 169/169 testes Playwright, zero skips, inesperados ou flaky e 1.016/1.016 asserções de integração. A faixa sem SQL rodou junto à faixa de banco, sem elevar os workers que acessam SQL. O contrato visual não foi solicitado. O manifesto, relatório Playwright e tempos de integração estão em `test-results/docker-20260923_090237_9c2df8/`.

Os testes offline atuais cobrem timeout/servidor local, sessão expirada, respostas inválidas, dependências temporárias, aborto de transação local, chaveamento por rota v1, coordenação entre abas, importação/exportação da fila e retry após falha de rede. O teste focal usa IndexedDB real e respostas controladas, sem SQL; a cobertura ponta a ponta continua incluída na execução completa.

## Ainda limitado por HTTP sem servidor

- F5, nova aba ou reabertura depois de fechar o navegador sem acesso ao servidor não são garantidos. A casca preparada continua sendo a unidade de execução offline.
- Background Sync, Service Worker e Web Locks não são usados.
- Conflitos entre dois dispositivos que alteram o mesmo jogo ainda dependem da idempotência da mutação; não há controle de versão concorrente no servidor.
- A casca depende de ter sido preparada enquanto o servidor estava acessível; o navegador não promete reconstruir a aplicação inteira depois de limpar o armazenamento local.

## Próxima etapa recomendada

Se o fluxo crescer, adicionar uma tela de pendências com lista por partida e reautenticação. O banner já oferece tentativa manual, exportação e seleção de arquivo para importação usando `SGIOffline.getPendingList()`, `syncNow()`, `downloadPending()` e `importPending(file)`; a tela não deve remover registros diretamente do IndexedDB.
