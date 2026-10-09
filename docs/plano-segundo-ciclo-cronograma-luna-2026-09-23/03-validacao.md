# Matriz e comandos de validação

| ID | Cenário e resultado esperado | Camada |
| --- | --- | --- |
| V01 | Dois ciclos de publicar/abrir/encerrar/revisar, sem reload: ações válidas continuam clicáveis e cada clique envia uma mutação | JS + navegador real |
| V02 | Janela justa com um confronto: regenerar após revisão cabe no mesmo local/horário; repetir terceira vez | Integração + navegador |
| V03 | Reserva independente realmente bloqueia a vaga; pendência não vira publicação parcial | Integração |
| V04 | Snapshot anterior e inscrições preservados na revisão, publicação atômica, rollback sem resíduos | Integração |
| V05 | `success:false` com pendências mostra motivos/contexto e bloqueia Publicar | JS + navegador |
| V06 | Alterar data/hora/duração ou preparar equipes invalida proposta anterior | JS + navegador |
| V07 | Duplo clique ou gerações sobrepostas não restauram proposta/estado obsoleto | JS com respostas controladas |
| V08 | Outra aba altera revisão: publicação antiga é recusada sem gravação; usuário pode consultar e gerar novamente | HTTP + navegador |
| V09 | POST confirmado seguido de GET falho não habilita botão inerte nem repete gravação | JS + navegador com falha só no GET |
| V10 | Timeout, HTTP 500, HTML/JSON inválido e erro de domínio deixam recuperação clara, sem falso sucesso | JS + HTTP |
| V11 | Só existe um caminho de geração na jornada; nenhum request de programação sequencial obsoleta | Navegador + inventário |
| V12 | Repetição de abrir/encerrar e chamadas após liberação seguem contrato explícito, sem 500 por ausência de mudança | HTTP + persistência |
| V13 | Desativar/reentrar página não duplica listeners; resposta atrasada não altera tela desmontada; raiz/subdiretório funcionam | JS + navegador |
| V14 | Administração autorizada; aluno/mesário não mutam; CSRF e edição continuam protegidos; revisão pós-liberação preserva resultados | HTTP + integração |
| V15 | Jornada com inscrição real, liberação, avanço e resultado offline reconciliado preserva calendário; layout/foco funcionam | Navegador + visual |
| V16 | E2E encontra jogos pelos nós publicados/fixture, com IDs variáveis, e exige dois confrontos de semifinal corretos; nenhuma dependência de `PL:4:` fixo | Navegador real |

Os testes devem verificar comportamento observável e falhar quando o defeito correspondente voltar. Usar os executores oficiais e dados sintéticos. Não adicionar specs SQL ao projeto `independent`. Não usar esperas arbitrárias nem relaxar asserções para passar.

## Comandos conferidos nos scripts atuais

```powershell
# JS sem banco
npm test

# PHPUnit sem banco
composer test:unit

# Integração isolada, feedback inicial
powershell -ExecutionPolicy Bypass -File tools/test-docker.ps1 -Database mariadb -SkipQuality -SkipBrowser

# Integração e navegador, sem afirmar aprovação de qualidade/visual
powershell -ExecutionPolicy Bypass -File tools/test-docker.ps1 -Database mariadb -SkipQuality

# Gate final completo, incluindo visual
powershell -ExecutionPolicy Bypass -File tools/test-docker.ps1 -Database mariadb -IncludeVisual

# Quando alterar SQL/schema de modo específico ao motor
powershell -ExecutionPolicy Bypass -File tools/test-docker.ps1 -Database mysql -IncludeVisual

git diff --check
```

`test-docker.ps1` não aceita `-Suite` nem filtro de spec. Para perfis, `test-local.ps1` aceita `-Suite quality|integration|browser|visual|all` e também cria container para banco. Não executar Playwright ou `tests/run_all.php` diretamente contra o ambiente local. Não usar `-Keep` sem necessidade explícita.

Manifesto: `test-results/docker-<run-id>/run-manifest.json`. Relatórios JSON: `browser-playwright.json`/`visual-playwright.json` no diretório da execução; integração: `integration-timings.json`. Evidências Playwright: `tests/browser/test-results/docker-<run-id>/browser` e `/visual`. Registrar nomes reais dos arquivos de log que existirem, sem inventar relatórios ausentes. Correlacionar falhas pelo run ID, horário, método/rota e cenário. Sucesso local não comprova CI remoto.
