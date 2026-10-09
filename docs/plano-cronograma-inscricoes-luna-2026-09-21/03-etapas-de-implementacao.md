# Etapas executáveis

Cada tarefa exige leitura dos contratos atuais, teste de regressão junto da mudança e evidência em [STATUS](STATUS.md). Consultar [validação](04-validacao.md) para comandos. Antes de refatoração, executar a suíte completa; depois de cada entrega funcional, regressão específica e perfil completo conforme AGENTS. Falta de Docker é impedimento de validação, não autorização para usar SQL local.

## T00 — Baseline e inventário

**Entrada:** checkout preservado e documentos deste pacote lidos.

1. Registrar commit, branch, alterações preexistentes e dependências disponíveis, sem imprimir `.env` ou segredos.
2. Conferir schema inicial, migrations, rotas, testes e todos os caminhos que criam equipes, alteram elencos, modificam jogos e confirmam agenda. Incluir importação/criação de padrões e operações administrativas, não só portal do aluno.
3. Rastrear individual: onde participantes derivam de vínculos, como resultados são registrados e como representar vagas sem atletas.
4. Conferir consumidores de tags, reservas e IDs temporários no avanço online/offline.
5. Executar baseline completo MariaDB com visual. Registrar falhas preexistentes separadamente, sem alterar snapshots para passar.
6. Acrescentar caracterização permanente dos comportamentos atuais de equipe padrão, inscrição parcial, exigência de elenco e agenda; novos testes devem demonstrar as lacunas antes de corrigir, quando viável.

**Saída:** mapa de escritores/locks/rotas no STATUS, baseline real e decisão sobre onde estender entidades. Não exigir arquivo original do regulamento nem credenciais reais.

## T01 — Configuração e persistência

**Depende:** T00. **Regras:** R01–R03, R07, R12.

1. Implementar regras puras de quantidade, capacidade, formato, duração, descanso e pertencimento de turmas/locais.
2. Definir e registrar DDL conforme o modelo lógico do documento técnico, com índices/identidades únicas e FKs quando aplicáveis.
3. Criar migration futura e atualizar baseline sem alterar migration aplicada. Verificar instalação nova + migrate, upgrade e repetição.
4. Acrescentar configuração e contratos de consulta/escrita de modalidade. Atualização parcial valida o estado final, incluindo limites já existentes.
5. Toda edição inicia com inscrições fechadas e planejamento obrigatório. Não inferir capacidade nem criar equipes a partir de nomes existentes.
6. Definir quais modalidades participam da publicação: seleção persistida, não apenas filtro temporário da tela. Inativar/retirar modalidade já publicada passa por revisão.

**Aceite:** rejeitar zero/fração/overflow/limites contraditórios; toda modalidade exige configuração finita. Uma categoria não pode selecionar turma de outra; atualizar a instalação sintética não altera vínculos ou resultados existentes.

## T02 — Preparação das equipes e vagas

**Depende:** T01. **Regras:** R01–R04.

1. Criar caso de uso transacional de preparação, composto nas rotas; reusar API de geração quando compatível.
2. Gerar N entradas por turma selecionada com identidade estável e ordinal; não depender do nome ou da presença de alunos.
3. Tratar repetição e concorrência: mesmas quantidades retornam mesmas entradas; reenvio não duplica.
4. Aumento em rascunho cria apenas entradas faltantes e invalida proposta de agenda. Redução com vínculo/jogo recusa exclusão automática e relata impacto.
5. Impedir que rotinas de equipe padrão/redistribuição aumentem a quantidade ou desviem inscrições após a preparação planejada.

**Aceite:** três turmas × duas entradas = seis, mesmo após repetir/concorrer; nenhuma partida concluída, pontuação ou avanço surge por equipe vazia. Elencos e IDs existentes permanecem íntegros.

## T03 — Estrutura da competição sem elenco

**Depende:** T02. **Regras:** R01, R04, R05.

1. Separar planejamento do caso de uso operacional que atualmente exige elenco.
2. Gerar e persistir árvore/nós com identidades estáveis, adversários, BYEs e dependências; manter ordem/sorteio ao regenerar apenas horários.
3. Construir projeção de compromissos alcançáveis por entrada. Validar ciclos, nós órfãos e referências de outra modalidade/categoria.
4. Para formato individual, criar sessões com vagas previstas e mapear posteriormente os alunos para o fluxo de resultados existente. Não inventar suporte a séries classificatórias não configuradas: sessões/fases e dependências devem ser explícitas.
5. Materialização de jogos, quando necessária, usa identidade do nó; nunca cria atleta fictício ou resultado para preencher a árvore.

**Aceite:** com três entradas, dois confrontos reais e um BYE estrutural; com quatro, três confrontos; com seis/oito entradas em mata-mata, cinco/sete. Final existe como compromisso futuro sem aluno definido; não gera pódio antecipado. Uma prova individual possui sessão agendável sem exigir vencedor.

## T04 — Agenda completa da edição

**Depende:** T03. **Regras:** R05–R06.

1. Estender simulação para todas as modalidades participantes; carregar janelas, recursos permitidos, durações e reservas fixas do servidor.
2. Ordenar deterministicamente por dependências e restrições; empate por identidade estável. Simulação não escreve nem refaz sorteio.
3. Respeitar recurso, categoria, percurso possível da mesma equipe, descanso, transição, pausas e término das janelas. Duas categorias compartilham ocupação do recurso.
4. Conferir a política atual de margem de dez minutos citada na arquitetura e sua implementação; eliminar divergência entre simulação, edição manual e confirmação no fluxo planejado.
5. Retornar pendências detalhadas; jamais encurtar duração automaticamente para encaixar.
6. Confirmar rascunho com revisão esperada, locks e revalidação integral. Edição manual e sequencial usam as mesmas invariantes.

**Aceite:** grade insuficiente retorna confrontos pendentes e impede publicação; simular duas vezes com mesma entrada é determinístico; modificar local/horário por outra rota invalida proposta anterior.

## T05 — Publicação e inscrições abertas

**Depende:** T04. **Regras:** R05, R07, R11.

1. Implementar estados/transições do documento de regras com autorização no servidor.
2. Publicar snapshot completo de compromissos e versão, inclusive fases condicionais. Toda modalidade participante deve estar coberta.
3. Abrir/fechar inscrições explicitamente; verificar período e fuso em cada mutação, sem depender de tarefa agendada.
4. Criar revisão preservando publicação anterior, com inscrições fechadas. Consultas distinguem agenda publicada e rascunho.
5. Cobrir acesso direto às rotas novas e às antigas que poderiam contornar o fechamento.

**Aceite:** API recusa inscrição anterior à publicação/fora do período; mesário/aluno não publicam; uma falha ao gravar snapshot não deixa inscrições abertas com agenda incompleta.

## T06 — Inscrição exata e disponibilidade

**Depende:** T05. **Regras:** R06–R11.

1. Criar regra pura de intervalos e serviço de consulta/projeção de compromissos com contratos de domínio.
2. Adaptar inscrição do modo planejado para equipe exata, capacidade por equipe, unicidade aluno/modalidade e máximo de três modalidades distintas.
3. Validar elegibilidade existente, estado/período, versão, escolhas do lote e inscrições anteriores dentro da transação.
4. Aplicar conflito confirmado/potencial e margem; retornar erro estruturado com ambos os compromissos.
5. Confirmar todas as novas escolhas ou nenhuma. Reenvio da mesma escolha é idempotente quanto ao vínculo.
6. Conectar inclusão administrativa, transferência e redistribuição à mesma política. Não remover vínculo de origem antes de validar/gravar destino.
7. Serializar com publicação e escritores da agenda; confirmar comportamento com dois clientes concorrentes.

**Aceite:** aluno que escolhe equipe 2 entra na equipe 2; equipe 1 livre não autoriza lotar equipe 2; conflito somente na final já bloqueia; lote de duas escolhas com uma inválida não grava nenhuma; transferência inválida preserva origem.

## T07 — Interface e ciclo de vida

**Depende:** T01–T06. **Regras:** todas as regras expostas ao usuário.

1. Inventariar e documentar tokens/componentes compartilhados antes de estilizar: cores, tipografia, espaçamento, raios, sombras, foco, erros e breakpoints. Não criar CSS isolado.
2. Cadastro: quantidade por turma, tamanho do elenco, formato, duração/recursos e resumo do total de entradas.
3. Preparação: tabela de equipes vazias e capacidade; resultados de repetição/preparação sem duplicações.
4. Agenda: rascunho/publicação, pendências, horários por recurso/categoria, revisão esperada, publicação e abertura separadas.
5. Aluno: equipe exata, vagas, agenda confirmada/condicional, motivo de bloqueio e resumo das escolhas antes de confirmar. Nenhuma opção indisponível deve parecer confirmada.
6. Versão obsoleta: manter seleção local, atualizar dados e exigir nova confirmação; não substituir equipe silenciosamente.
7. Elenco: mínimo/máximo, aptidão e conflitos para inclusão/transferência.
8. Validar teclado, leitor de tela, mobile, contraste, estados de carregamento/erro e reentrada; liberação de listeners/timers por `page-runtime.js`.

**Aceite:** fluxo completo executável sem ferramentas externas; comportamento igual em raiz e subdiretório; duplo clique não duplica; regra continua protegida via HTTP direto com JavaScript desativado.

## T08 — Revisão, operação e offline

**Depende:** T06–T07. **Regras:** R04, R09, R11–R12.

1. Fechamento lista equipes incompletas; liberação operacional exige mínimos ou resolução explícita de retirada. Reserva não é atleta fictício.
2. Revisão calcula impacto nos inscritos e bloqueia publicação com conflitos não resolvidos; suspensão mantém agenda anterior identificada como suspensa.
3. Proibir regeneração destrutiva após início; materializar sucessoras idempotentemente conforme resultados e reservas.
4. Propagar versão/estado operacional para preparação do mesário sem limpar cache/fila. Dispositivo offline não pode provar que recebeu revisão posterior; registrar essa limitação e avisar na reconexão.
5. Impedir fila offline de inscrição/publicação, mantendo resultados offline existentes. Reenvios antigos continuam íntegros e recusas ficam revisáveis.
6. Testar início/avanço/resultado/individual no modo planejado, preservando autoria, pontos obrigatórios e atomicidade.

**Aceite:** uma final planejada e depois materializada ocupa a reserva original; replay não duplica jogo/pontos; revisão não perde fila; equipe vazia não opera partida real. Não declarar revisão recebida por dispositivo desconectado.

## T09 — Validação e entrega

**Depende:** T00–T08.

1. Executar integralmente a matriz; validar MariaDB e MySQL para as alterações de schema/SQL. Usar visual e não pular qualidade/navegador.
2. Executar cenário sintético completo: cadastrar categorias/turmas/modalidades, equipes vazias, agenda, publicação, inscrições compatíveis/incompatíveis, fechamento, jogo e avanço online/offline.
3. Atualizar README, arquitetura, testes e implantação apenas com funcionalidades efetivamente implementadas; documentar revisão/suspensão, limites do offline e recuperação de falhas.
4. Revisar diff, segredos, stage e ausência de arquivos gerados; commits atômicos por entrega coerente, preservando mudanças do usuário.
5. Registrar ambiente, commit, comando, horário com fuso, resultado, logs e limitações. Não afirmar CI remoto aprovado com base em execução local.

**Aceite:** todos os critérios obrigatórios com evidência. Se um teste/pré-requisito impedir validação, status permanece parcial/impedido; informar exatamente o restante. Push somente após bateria integral aprovada, quando autorizado no trabalho de implementação.
