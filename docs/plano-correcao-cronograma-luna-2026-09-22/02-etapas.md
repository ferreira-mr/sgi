# Etapas executáveis C00–C12

Executar na ordem do [README](README.md). Cada etapa entrega código e testes juntos e atualiza [STATUS](STATUS.md). Antes de alterar o comportamento, escrever a regressão e demonstrar a falha pelo motivo esperado, quando viável sem desfazer trabalho do usuário. Regressões pertencem às suítes descobertas pelos executores; scripts avulsos não são cobertura final.

Após cada correção funcional: regressão específica e perfil completo conforme AGENTS. Refatoração exige suíte completa antes/depois. Incluir visual quando houver aparência/layout e os dois motores para schema/SQL. Não iniciar banco local, remover testes ou usar skips para avançar. Se um pré-requisito falhar, registrar o impedimento e continuar apenas trabalho independente que seja possível.

## C00 — Confirmar baseline e contratos

**Depende:** nenhuma. **Ler:** inventário, auditoria, rotas, schema/migrações, executores e AGENTS atual.

1. Registrar branch/commit e alterações preexistentes. O documento de auditoria pode estar não versionado; preservar seu conteúdo.
2. Produzir o mapa de operações/escritores/locks/consumidores descrito no inventário, incluindo APIs que não mencionam cronograma.
3. Executar baseline completo MariaDB com visual. Registrar as falhas preexistentes e verificar a perda de artefatos entre perfis sem provocar falha artificial na suíte do produto.
4. Conferir diretamente os A01–A08. Catalogar por achado: reprodução, teste que falta, unidade responsável e aceites. Não marcar um achado resolvido só porque a suíte antiga passou.

**Saída/aceite:** mapa e baseline reais em STATUS; nenhum código de negócio alterado antes desse registro. Se o mesmo checkout já tiver uma execução válida desta sessão, é possível reutilizar a evidência explicitamente, sem chamá-la de execução nova.

## C01 — Preservar evidências dos perfis

**Depende:** C00. **Arquivos:** `compose.test.yml`, `tools/test-docker.ps1`, `tools/test-docker.sh`, `tools/test-local.ps1`, `tests/browser/playwright.config.cjs`, configuração visual e testes dos executores em `tests/javascript/`.

1. Atribuir saídas e relatórios exclusivos por perfil dentro da execução: `browser/` e `visual/`, sem colisão entre processos ou execuções.
2. Atualizar mounts/variáveis dos dois wrappers e do executor local. Confirmar onde Playwright limpa output e substitui HTML.
3. Criar regressão do contrato de caminhos: escrever evidência sintética no destino do primeiro perfil, preparar/executar a limpeza do segundo e comprovar que o primeiro continua íntegro. Preferir exercitar helper real do executor a procurar strings no arquivo.
4. Validar logs, relatórios e traces retidos após navegador + visual. Não fabricar sucesso da aplicação para testar o runner.

**Aceite:** arquivos do navegador sobrevivem ao perfil visual, inclusive falhas que passaram no retry; caminhos reais registrados em STATUS. Investigar os intermitentes da auditoria separadamente, sem atribuir causa sem reprodução.

## C02 — Persistir identidade e estados finais

**Depende:** C01. **Arquivos:** contratos de cronograma, migrações, `MigrationRunner`, composição e testes de migração.

1. Definir DDL final: nó no escopo modalidade/categoria, identidade estrutural estável, snapshot por versão, vínculos explícitos com origens/jogos/reserva, revisão de trabalho e referência de publicação. Registrar índices/FKs que garantem unicidade e pertencimento junto às validações de aplicação.
2. Adicionar migração futura sem modificar checksum de migration existente. Testar instalação limpa e reaplicação sem duplicação em MariaDB 10.11. Não converter payloads/filas de software antigo.
3. Atualizar contratos PHP e todos os dublês/consumidores afetados. Casos de uso usam `TransactionRunner` quando coordenarem múltiplos repositórios; manter transações aninhadas compatíveis com savepoints.
4. Separar consulta de publicação suspensa de revisão de trabalho; nem `MAX` genérico nem versão de rascunho devem ocultar snapshot anterior.

**Aceite:** duas modalidades podem ter posições equivalentes de chave sem colisão; snapshot correto continua consultável após revisar; instalação e repetição aprovadas; sem mudança em banco de trabalho.

## C03 — Corrigir preparação, árvore e BYEs

**Depende:** C02. **Arquivos:** planejador, preparação de equipes, `TipoCompeticaoRules` e suas suítes.

1. Regressões iniciais: 3/4 turmas × uma entrada; duas modalidades com mesmos slots; seis entradas e BYE com origem em jogo ainda não resolvido.
2. Preparar exatamente N entradas por turma, com ordinais estáveis, capacidade sincronizada e quantidade respeitando limites. Preparação repetida/concorrente não duplica; redução que afeta vínculos/jogos deve ser recusada ou passar por resolução explícita sem exclusão silenciosa.
3. Gerar uma árvore por modalidade/categoria com o conjunto completo de entradas; validar turmas ativas elegíveis. Seleção de formato de competição independe do tamanho/formato do elenco.
4. Derivar candidatos e origens no servidor. Recusar ciclo, referência ausente, origem de outra categoria/modalidade, equipe inativa e payload que altera candidatos arbitrariamente.
5. Resolver BYE recursivo sem criar resultado. Reagendar não altera ordem da estrutura; usar identidade persistida para reconstrução.

**Aceite:** 3/4/6/8 entradas produzem 2/3/5/7 confrontos normais; 3 turmas não viram 3 BYEs isolados; duplas e individuais em mata-mata funcionam; prova por marcas segue sessões próprias. Vencedor do ramo 5×6 é quem alcança a final, mesmo se o vencedor for 6.

## C04 — Unificar agenda e disponibilidade

**Depende:** C03. **Arquivos:** regras/schedulers, repositório cronograma, `MysqliLocalScheduleGuard`, projeção por equipe e novas políticas puras necessárias.

1. Extrair regra compartilhada de intervalos normalizados, descanso/deslocamento e ocupação de recurso. Testar intervalos isolados inválidos, adjacência e datas diferentes.
2. Projetar todos os compromissos alcançáveis por entrada e atualizar possibilidades após resultado confirmado. Remover duplicidade do mesmo compromisso por múltiplos caminhos.
3. Gerar agenda determinística com janelas, dependências, locais, reservas e jogos. Permitir simultaneidade de jogos independentes em locais distintos; respeitar precedência dos dependentes.
4. Retornar pendências concretas quando faltar espaço; não truncar duração nem omitir fase para apresentar sucesso.
5. Integrar leitura de ocupação em todos os escritores. A própria reserva de um nó materializado deve ser excluída do conflito consigo mesmo sem excluir outras reservas.

**Aceite:** final tem horário posterior às origens; grade insuficiente bloqueia publicação; duas categorias no mesmo local conflitam; dois jogos independentes cabem em dois locais simultâneos; descanso e deslocamento têm o mesmo resultado na simulação e confirmação.

## C05 — Fechar publicação, revisão e concorrência

**Depende:** C04. **Arquivos:** `CronogramaService`, repositórios/contratos, controlador e todos os escritores de configuração/agenda inventariados.

1. Antes da correção, provar recusa ausente de proposta com nós normais e `compromissos=[]`, final removida, local de outra edição e reserva posterior à simulação.
2. Implementar validação completa no caso de uso: árvore canônica, cobertura exata dos nós físicos, intervalos, recurso, precedência, candidatos e conflitos dos alunos já inscritos. Não aceitar campos “validado”/“sem conflitos” do cliente como evidência.
3. Adquirir locks na ordem comum e comparar revisão atual dentro da transação; trocar snapshot/referência somente após sucesso completo. Falha após gravar parte dos nós faz rollback integral.
4. Revisar fecha inscrições e conserva publicação suspensa. Toda alteração relevante em rascunho/revisão também muda revisão e invalida prévias. Repetir alteração em revisão não reutiliza token antigo.
5. Definir abertura/encerramento explícitos e período obrigatório, recusando transições inválidas. Resposta de repetição deve ser coerente; atualização sem mudança de linha não pode gerar 500 por `affected_rows=0` sem analisar o estado.

**Aceite:** nenhum snapshot incompleto publicado, nenhuma inscrição aberta sem publicação válida, republicação conflitante recusada atomicamente, duas abas não sobrescrevem trabalho e cadastro de reserva concorrente não é ignorado.

## C06 — Tornar inscrição temporal, versionada e atômica

**Depende:** C05. **Arquivos:** `InscricaoService`, contrato/repositório/controlador, consulta do portal, testes unitários/HTTP/concorrência.

1. Exigir versão publicada/revisão consultadas e encaminhá-las até a persistência. Atualizar chamadores e fixtures; remover defaults que aceitem omissão.
2. Sob lock comum, carregar todas as datas/estado atuais e validar janela no relógio do servidor. Não usar SELECT incompleto nem confiar na disponibilidade mostrada no navegador.
3. Validar todo o lote e inscrições anteriores antes do commit. Qualquer erro de escolha/capacidade/escopo/conflito lança recusa com rollback; preservar vínculos preexistentes. Não retornar sucesso acompanhado de escolhas descartadas.
4. Seleção é da equipe exata. Duplicata exata não ocupa vaga; segunda equipe da mesma modalidade não é silenciosamente ignorada nem redirecionada à padrão.
5. Manter autorização, sessão revalidada, primeiro acesso, termos, gênero/categoria/turma e limite de três modalidades.

**Aceite:** testes via HTTP como aluno verificam antes da abertura, abertura exata, fechamento exato, revisão ausente/obsoleta, lote válido+lotado, válido+inexistente e conflito só na final. Disputa pela última vaga confirma exatamente um aluno; falha após primeira escrita deixa zero vínculos novos.

## C07 — Integrar elencos e escritores administrativos

**Depende:** C06. **Arquivos:** serviços/repositórios de equipe, padrão/redistribuição, turma, modalidade, local, jogos e blocos.

1. Substituir regras duplicadas de disponibilidade pela política de C04. Inclusão e transferência aplicam o mesmo estado, elegibilidade e agenda do caso de uso apropriado.
2. Transferência inválida mantém origem; remoção recalcula aptidão. Correção administrativa após encerramento revalida operação e não abre inscrição do aluno.
3. Toda rota mantida que altera estrutura/horário invalida revisão ou recusa modificação incompatível com a publicação; nenhuma edição manual ignora inscritos/reservas.
4. Sincronizar capacidade das equipes existentes ao mudar configuração; recusar redução abaixo do elenco já válido sem resolução explícita. Bloquear mudança destrutiva de jogos iniciados.
5. Remover caminhos substituídos e testar acesso direto às rotas remanescentes; não esconder botão como única proteção.

**Aceite:** inclusão, transferência e redistribuição não permitem conflito; edição manual não ocupa recurso reservado; configuração alterada na segunda aba invalida a primeira proposta; matriz de perfis e outra edição coberta por HTTP.

## C08 — Liberar operação e materializar pelo fluxo canônico

**Depende:** C07. **Arquivos:** cronograma, resultado/chaveamento, participantes individuais, pontuação e sincronização.

1. Exigir encerramento e elencos aptos segundo mínimo/máximo/participantes elegíveis, ou resolução explícita de retirada. Um vínculo isolado não satisfaz mínimo cinco.
2. Materializar por `id_no` autorizado/publicado, obter o vínculo estrutural e criar jogo/partidas uma única vez com a reserva correta. Não localizar por nome livre ou tag incompleta.
3. Resolver origens por resultados definitivos e regra existente de vencedor. Origem pendente/empate recusa avanço; BYE intermediário percorre dependências.
4. Integrar a sucessora ao caminho de resultado existente, com confirmação atômica de pontos, avanço e idempotência. Offline e servidor devem usar a mesma identidade, sem dois criadores independentes de final.
5. Para individual por marcas, associar as vagas aos participantes reais e exercitar classificação/pódio existentes, sem inventar atleta fictício.

**Aceite:** mínimo−1 recusa; mínimo aceita; inscrição aberta não libera operação; reenvio materializa exatamente um jogo; resultado de semifinal faz o vencedor real chegar à final; falha no avanço desfaz resultado/pontos conforme contrato transacional.

## C09 — Completar painel, portal e recuperação

**Depende:** C08. **Arquivos:** fontes de agenda/modalidades/portal/elenco e estilos compartilhados existentes.

1. Registrar design system existente antes de alterar layout; reutilizar componentes, tokens e breakpoints. Nada de CSS novo isolado ou inline.
2. Exibir prévia inspecionável de nós, equipes candidatas, horários/locais e pendências. Separar botões publicar/abrir/encerrar/revisar e acesso à operação; campos de período rotulados e mensagens associadas.
3. Invalidar prévia ao mudar qualquer parâmetro, depois de preparação ou quando a revisão mudar. Publicar usa revisão da prévia, não um estado global atualizado independentemente.
4. Após erro/queda de rede, reconciliar estado. Se publicação funcionou e abertura falhou, permitir apenas repetir a abertura. Recalcular botões após todos os ciclos, incluindo segunda revisão.
5. Portal envia seleção exata/tokens consultados; conflito preserva seleção, apresenta motivo e pede reconfirmação. Sucesso mostra o que foi efetivamente persistido.
6. Cobrir teclado/foco, mobile/desktop, anúncios de estado, duplo clique, reentrada e limpeza de listeners pelo runtime. URLs funcionam na raiz e subdiretório.

**Aceite:** jornada realizável pela interface sem chamadas manuais de API; editar janela impede publicação de prévia velha; JSON inválido/HTML 200 não vira confirmação; segundo ciclo de revisão funciona; comportamento comprovado com API real e erros controlados em testes separados.

## C10 — Tratar revisão com mesário offline

**Depende:** C09. **Arquivos:** módulos offline, preparo/projeções do mesário, sincronização e APIs de resultado.

1. Incluir referência de publicação/revisão e liberação operacional no preparo; consumir os campos de estado, em vez de apenas retorná-los da API.
2. Impedir fila de ações administrativas/inscrição, mantendo fila de resultados. Confirmar política explícita de roteamento na interceptação global.
3. Na mesma aba preparada, operar offline; revisar evento em outra sessão; reconectar e detectar estado obsoleto. Preservar operações pendentes e oferecer atualização/revisão apropriada.
4. Resultado do mesmo jogo ainda válido não duplica por mudança de horário; mudança incompatível de identidade/participante não pode ser remapeada silenciosamente. Atualizar CSRF e manter recusas para revisão.
5. Não criar leitor de formato antigo; fixtures usam contrato final. Não limpar IndexedDB para fazer o teste passar nem afirmar revisão recebida enquanto desconectado.

**Aceite:** navegação/reentrada, revisão e reconexão preservam a fila; API não confirma payload incompatível; replay mantém um único resultado/ponto/avanço; somente nova preparação válida libera a interface quando necessária.

## C11 — Provar o fluxo completo e limites

**Depende:** C10. **Arquivos:** suítes unitárias, integração, JavaScript e navegador; registrar testes novos no runner.

1. Executar a matriz V01–V26 de [validação](03-validacao.md) e preencher evidência por linha, com teste responsável e resultado.
2. Criar jornada Playwright real: configuração → preparo → geração → publicação → abertura → aluno → encerramento → mínimos → jogo/avanço → revisão/reconexão. Não substituir as APIs centrais por `page.route` nessa jornada.
3. Separar testes negativos em fixtures pequenas; concorrência usa barreiras e conexões/sessões independentes. Assertar estado final do banco, não apenas texto da resposta.
4. Substituir asserções enganosas: “persistiu” exige consulta ao banco; “não criou jogo” exige contagem antes/depois; “revisão preservada” exige consulta autorizada da publicação suspensa.
5. Acrescentar contrato visual de estados relevantes do cronograma em desktop/mobile; inspecionar antes de salvar referências. Não usar screenshots do login como prova de layout da agenda.

**Aceite:** matriz completa com resultado observável e descoberta pelos executores; cada defeito crítico possui regressão que falhava antes. Guardar evidências negativas antes da correção sem reverter trabalho do usuário.

## C12 — Validar e entregar

**Depende:** C11.

1. Rodar a bateria final completa MariaDB 10.11 + visual para esta mudança de schema/SQL; executar o teste específico antes de cada nova rodada motivada por correção.
2. Inspecionar falhas, retries e artefatos de ambos os perfis. Não chamar uma execução parcial ou com impedimento de aprovação completa. Intermitência não deve desaparecer do relatório só porque o retry passou.
3. Atualizar README, arquitetura, testes, implantação e o status do plano anterior com referência à correção e apenas capacidades comprovadas. Manter a auditoria como registro histórico, acrescentando resolução por achado com links para testes/evidências.
4. Revisar diff, contratos órfãos, queries/índices, fronteiras, arquivos gerados e segredos. Executar `git diff --check`, revisar stage e criar commits atômicos sem mudanças preexistentes alheias ao escopo.
5. Entregar resumo, comandos/exit codes, ambiente/commit, logs, matriz e limitações; CI remoto separado. Não publicar automaticamente.

**Aceite:** C00–C11 demonstradas, matriz e baterias requeridas aprovadas, histórico de evidências preservado e nenhuma pendência apresentada como conclusão.
