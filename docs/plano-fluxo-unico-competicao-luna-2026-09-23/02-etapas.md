# Etapas de implementação

Executar sequencialmente. Cada etapa exige regressão observável, revisão de diff, evidências no STATUS e suíte proporcional conforme AGENTS. Antes/depois de refatorações, bateria completa isolada. Não avançar declarando aprovado um gate não executado; em bloqueio de ambiente, registrar o limite e fazer somente trabalho independente seguro.

## U00 — Baseline e mapa real

**Depende:** nenhuma. **Ler:** inventário, contratos, código e testes dos fluxos afetados.

1. Registrar HEAD, alterações preexistentes, ambiente, dependências e matriz de testes vigente. Separar responsabilidade sobre arquivos compartilhados com outras tarefas.
2. Construir o mapa exigido no inventário, incluindo tags `MM:`/`PL:`, leitura de ranking, provas individuais e avanço offline.
3. Conferir contratos públicos e esquema de todas as migrações. Identificar chamadas legítimas de geração, resultado e materialização.
4. Executar testes focais e baseline completo antes da refatoração, em containers oficiais para SQL/HTTP/navegador. Registrar falhas preexistentes sem alterá-las para obter verde.

**Aceite:** mapa cobre escritores e consumidores, baseline reproduzível e nenhuma alteração do usuário foi revertida.

## U01 — Fixar a regressão da jornada desejada

**Depende:** U00. **Arquivos:** testes de cronograma, chaveamento, resultado e fixtures descobertas pelos runners atuais.

1. Criar cenário isolado com uma edição, quatro turmas da mesma categoria, uma modalidade de mata-mata, uma equipe vazia por turma e locais disponíveis. Alunos podem existir cadastrados, mas assertar zero vínculos nas equipes da edição antes de gerar/publicar.
2. Demonstrar que preparação/publicação não precisam de elenco e que um aluno sem inscrição consulta sua agenda prevista.
3. Acrescentar regressões que falhem quando liberar apenas muda uma flag, quando a geração direta cria outra árvore e quando resultado planejado não chega à fase seguinte.
4. Registrar falha pelo motivo esperado antes da correção, quando possível sem desfazer alterações alheias. Não deixar teste novo fora dos executores.

**Aceite:** o teste distingue planejamento, liberação e avanço; não se limita a status HTTP ou contagem de nós.

## U02 — Vínculo persistente e coordenação

**Depende:** U01. **Arquivos:** contratos Domain, serviço Application, infraestrutura, composição e migrações se necessárias.

1. Documentar no STATUS o desenho de identidade e continuidade entre revisões, conforme F04/F08. Conferir como serão reconhecidos jogos e filas já persistidos; não pressupor base vazia fora dos testes.
2. Introduzir o vínculo/índices mínimos necessários com nova migração, se o schema ainda não garantir unicidade. Testar colisões e rollback; não usar nome do jogo como única garantia.
3. Extrair apenas a coordenação necessária para Application com `TransactionRunner`. SQL, locks e implementações ficam em Infrastructure; políticas puras em Domain. Não ampliar exceções arquiteturais.
4. Compor dependências em `config/routes.php`, atualizar todos os implementadores e dublês dos contratos. Reutilizar serviços de resultado existentes.

**Aceite:** identidade testada entre modalidades/edições/revisões; Domain/Application sem MySQLi ou superglobais; instalação e evolução preservam dados.

## U03 — Liberação que prepara a operação

**Depende:** U02. **Arquivos:** liberação e materialização do cronograma, controlador e testes de unidade/HTTP/concorrência.

1. Implementar F03: revalidar revisão/estado/elencos/locais e resolver todos os nós imediatamente disponíveis.
2. Criar jogos/partidas e marcar operação na mesma transação. Prova individual usa o mesmo planejamento; nó futuro permanece previsto sem participantes fictícios.
3. Centralizar criação por nó para que liberação, avanço e eventual endpoint técnico reutilizem identidade e verificações.
4. Tratar dupla requisição/timeout como repetição segura; forçar falha após uma criação para provar rollback integral, inclusive da flag.

**Aceite:** quatro equipes aptas geram dois jogos iniciais, final permanece prevista; repetir/concorrer não aumenta os jogos. Elenco mínimo−1 impede tudo; exatamente o mínimo permite.

## U04 — Resultado avança pela árvore publicada

**Depende:** U03. **Arquivos:** resultado, gateways, regras de chaveamento, leitura de árvore, ranking/pontuação.

1. Substituir inferência independente de próximo adversário pela consulta de origens/destinos canônicos. Resolver BYEs sem jogo físico e sem escolher candidato arbitrário.
2. Preservar transação de pontos, resultado, avanço e pontuação. Próximo jogo copia compromisso publicado e recebe somente vencedores confirmados.
3. Conferir todos os leitores de fase/tag, inclusive classificação e prova individual; uma mudança de parser isolada não é aceite.
4. Cobrir empate, origem pendente, final terminal, repetição e correção de resultado com descendente já operado. Não recriar árvore ou apagar histórico.

**Aceite:** semifinais reais originam uma única final, com vencedores, data/local previstos e pontuação correta; 3 e 6 entradas preservam BYEs e identidade.

## U05 — Fechar o mesmo contrato offline

**Depende:** U04. **Arquivos:** projeções/preparo, engine, fila, sync gateway e testes JS/IndexedDB.

1. Incluir árvore, agenda, revisão e vínculos no preparo e na exportação permitida, sem credenciais antigas.
2. Fazer o engine local resolver a mesma topologia; preservar IDs negativos e ordem de dependências para final criada offline.
3. Reconciliar no servidor com criação idempotente por confronto e validação de operador/revisão. Testar disputa entre jogo já criado online e envio do temporário.
4. Cobrir mudança de revisão com fila pendente, duas abas, falha no meio do lote e confirmação inválida. Se schema local mudar, testar atualização com dados pendentes sem limpeza.

**Aceite:** mesma competição finalizada online ou offline produz os mesmos confrontos, horários, vencedores e pontuação, sem duplicatas após reconexão.

## U06 — Interface conduz o fluxo único

**Depende:** U05. **Arquivos:** agenda, chaveamento, portal, consultas HTTP e estilos compartilhados existentes.

1. Planejar tokens/componentes/estados reutilizáveis antes de estilizar. Reutilizar base existente; evitar redesenho não relacionado.
2. Exibir etapas e pendências do fluxo F02. “Liberar competição” executa U03 e mostra jogos disponíveis; erro mantém contexto e oferece ação pertinente.
3. Chaveamento mostra a árvore publicada mesmo sem jogos reais, com fases futuras e acesso ao placar só quando operável. Sem planejamento, orientar/linkar para a agenda da edição correta.
4. Preservar consulta do aluno antes da inscrição, incluindo horários condicionais. Diferenciar “previsto”, “aguardando participantes” e “disponível para operação” sem jargão de persistência.
5. Invalidar prévia obsoleta e recuperar de timeout/reentrada. Testar desktop/mobile, teclado, foco, raiz/subdiretório e ciclo de vida.

**Aceite:** administrador/aluno percorrem a jornada pela UI sem chamadas manuais de materialização e sem precisar localizar outra geração.

## U07 — Eliminar a geração paralela e os desvios

**Depende:** U06. **Arquivos:** botão e handlers de geração, controlador/serviço/contrato de chaveamento, demais escritores e fixtures.

1. Remover “Gerar chaveamento” como ação independente e recusar no servidor seus pedidos antigos, sem escrita. Registrar status/código de erro estável e testar acesso direto.
2. Preservar consultas, ranking e registro de resultado individual. Remover código morto somente após mapear chamadores; não apagar motor de avanço ainda usado.
3. Integrar ou bloquear criação manual, edição de jogo, agenda em blocos e sincronização que burlariam a árvore publicada. Não bloquear indiscriminadamente funcionalidades alheias à competição planejada.
4. Atualizar helpers de fixtures para preparar/publicar/inscrever/liberar por APIs canônicas quando o cenário depender da jornada. Fixtures de camadas baixas podem continuar específicas, mas não substituir o E2E real.
5. Revisar formato de filas persistidas coberto pelos testes; qualquer retirada exige estratégia permitida pelas instruções atuais, nunca descarte silencioso.

**Aceite:** só há uma fonte de confrontos; nenhuma requisição direta recria torneio e nenhum resultado legítimo é perdido pela retirada do caminho inicial.

## U08 — Jornada real e regressões cruzadas

**Depende:** U07. **Arquivos:** suítes existentes e novos testes registrados no runner apropriado.

1. Executar V01–V20 da matriz e vincular cada linha a testes/assertions concretos.
2. No navegador real, começar com zero vínculos, publicar, consultar como aluno, inscrever, encerrar, liberar e jogar até a final. Validar persistência via suíte HTTP/SQL isolada e interface por navegador.
3. Repetir variante offline na mesma aba preparada e variante de prova individual. Incluir falta de mínimos, conflito entre modalidades e revisão concorrente.
4. Manter mocks apenas para testes separados de erro/transporte. Não mockar a API na jornada principal.

**Aceite:** evidências mostram fluxo ponta a ponta, inclusive jogos/resultados finais, não somente botões presentes.

## U09 — Validação final e entrega

**Depende:** U08.

1. Executar a bateria completa com visual e os motores exigidos pelo AGENTS para SQL/migrações; comandos em `03-validacao.md`.
2. Inspecionar falhas, instabilidades e imagens. Não aprovar por retry, skip ou snapshot atualizado sem revisão.
3. Atualizar documentação de uso e operação afetada: explicar calendário → inscrição → liberação → resultados; tirar instruções de geração paralela dos guias vigentes, preservando documentos históricos identificados como históricos.
4. Revisar diff, whitespace, stage e STATUS. Fazer commits atômicos apenas das alterações deste trabalho quando prontas conforme AGENTS. Não publicar automaticamente.

**Aceite:** matriz rastreável, comandos/horários/ambientes/exit codes/logs registrados, limitações explícitas e CI remoto distinguido de execução local.
