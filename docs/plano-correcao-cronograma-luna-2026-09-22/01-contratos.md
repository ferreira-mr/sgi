# Contratos finais e desenho de implementação

Este documento define o comportamento a implementar. Os nomes de campos novos são a proposta canônica deste pacote; conferir consumidores atuais e atualizar todos em conjunto. Registrar o DDL e assinaturas finais em STATUS.

## 1. Estrutura e identidade

1. Uma modalidade pertence a uma edição/categoria e possui N entradas por turma participante. Preparação repetida conserva entradas e ordinais; alteração de capacidade atualiza metadados das entradas existentes de forma validada.
2. A árvore competitiva reúne as entradas de todas as turmas participantes dessa modalidade/categoria. Turma é atributo da equipe, não escopo obrigatório de um nó que reúne adversários de turmas diferentes.
3. Separar `formato_participacao` (equipe/dupla/individual) do formato de competição resolvido por `TipoCompeticaoRules`. Um participante individual pode disputar mata-mata; prova individual por marcas segue o fluxo individual existente.
4. Identidade estrutural inclui edição/modalidade e posição do nó, sem depender do nome livre de jogo. Cada snapshot tem um `id_no` persistido e único; a ação de materialização recebe esse ID e valida a versão publicada/escopo. Origem de nó e vínculo com jogo são explícitos.
5. Reagendar sem mudar a estrutura mantém o vínculo com jogos existentes. O vínculo operacional usa a identidade estrutural estável, não cria outra final só porque mudou o ID do nó no novo snapshot. Impedir regeneração destrutiva com jogos iniciados ou resultados.
6. BYE não cria partida, placar, ponto ou campeão fictício. Resolver origem BYE recursivamente até a entrada ou vencedor real; detectar ciclos. Não escolher primeira equipe candidata. Empate ou origem pendente não autoriza avanço por menor ID.

Alterar o modelo de `cronograma_nos.id_turma` e as restrições de unicidade conforme o escopo correto. Não basta acrescentar a modalidade à string mantendo consulta ambígua ou dependência de `nome_jogo`. Evoluir com migração numerada nova, respeitando checksums. Não desenvolver conversão de instalações antigas; validar instalação limpa e repetição em ambos os motores. Não adicionar o mesmo DDL ao baseline e à migração sem conferir a convergência do instalador.

## 2. Estado, revisão e publicação

Separar `revisao` de trabalho (monotônica) e `versao_publicada` (snapshot consultável). A revisão muda em toda alteração que possa mudar a validade de uma simulação ou de uma inscrição: configuração, entradas, agenda, locais, estado/janela e elenco relevante. Usar um token explícito de revisão no comando; não inferir ausência como zero. A publicação aponta para um snapshot completo e imutável. Revisar fecha inscrições e mantém a última publicação identificada como suspensa.

| Operação | Pré-condição | Resultado |
| --- | --- | --- |
| Preparar | Rascunho/revisão com inscrições fechadas | Entradas estáveis e proposta anterior invalidada |
| Simular | Configuração/entradas válidas | Proposta completa ou pendências, vinculada à revisão e parâmetros; nenhuma publicação |
| Publicar | Revisão esperada atual e validação integral | Novo snapshot, inscrições ainda fechadas |
| Abrir | Publicação válida e janela explícita | Aceita novas escolhas no intervalo configurado |
| Encerrar | Publicação com inscrições abertas | Novas escolhas impedidas; pendências de elenco consultáveis |
| Revisar | Publicação existente | Inscrições fechadas, revisão de trabalho nova, publicação anterior suspensa |
| Liberar operação | Inscrições encerradas e mínimos/retiradas resolvidos | Jogos elegíveis podem ser materializados/operados |

Abertura exige início/fim válidos com início < fim, no fuso configurado da aplicação/edição. Validar `[início, fim)` no servidor. Parsing deve rejeitar datas impossíveis e texto relativo. Usar relógio controlável para testes, sem dependência do horário da máquina.

O servidor reconstitui a estrutura/candidatos a partir da configuração válida e compara a proposta com esse conjunto. Nunca confiar no cliente para definir equipes alcançáveis, disponibilidade ou ausência de pendências. Publicação exige um compromisso físico por nó normal/individual e nenhum para BYE; recusar omissão, duplicação e nó órfão. Validar datas, ordem das fases, duração, intervalos, locais ativos da edição, reservas e jogos existentes, inclusive de outras modalidades/categorias que compartilham o recurso.

Reservas, cronograma e jogos precisam participar da mesma política de ocupação. Materializar deve vincular/consumir a reserva do próprio nó, sem contar a mesma ocupação duas vezes. Edição manual e agenda em blocos não podem ignorar compromisso publicado; alterações válidas passam por revisão e análise de impacto. Republicar revalida a disponibilidade de todos os inscritos, além das equipes.

## 3. Disponibilidade e inscrição

Uma política pura de disponibilidade recebe compromissos normalizados e margens explícitas. Projeção inclui jogo inicial e todas as fases alcançáveis; após eliminação confirmada, excluir somente compromissos futuros que deixaram de ser possíveis. Não incluir ramos de outra equipe nem comparar o aluno com dois lados da mesma final.

Para intervalos adjacentes, permitir apenas se `fim(A) + margem(A,B) <= início(B)`. Margem de pessoa é o maior descanso aplicável ou deslocamento configurado, sem somar o mesmo valor duas vezes. Troca de recurso é verificada separadamente pela regra atual de dez minutos. Não inventar valor de deslocamento: persistir configuração com valor explícito, podendo ser zero, e testá-la. Simulação, publicação, inscrição e elenco devem usar os mesmos critérios.

Inscrição exige usuário da sessão, edição, lista de equipes exatas, `versao_publicada` e `revisao` consultadas. Validar sob transação/locks: termos, primeiro acesso, sessão atual, elegibilidade, publicação/janela, revisão, no máximo três modalidades, uma equipe por modalidade, capacidade e conflito direto/condicional. Reenvio da mesma escolha não duplica vínculo; escolher outra equipe da mesma modalidade exige transferência. Uma escolha inválida no lote implica nenhuma nova gravação, preservando inscrições anteriores.

Na transferência, validar destino antes de retirar origem, na mesma transação. Inclusão/remoção/redistribuição administrativa precisa passar pela política de estado e agenda: não manter caminho que aceite conflito ou modifique operação iniciada silenciosamente. Correção de elenco após encerramento deve ter ação administrativa explícita com revalidação de aptidão/impacto, sem reabrir inscrições de alunos implicitamente.

## 4. HTTP e interface

Manter rotas REST existentes quando comportarem o novo contrato; remover aliases substituídos. Mapear todos os consumidores antes de mudar a assinatura. Sugestão canônica para `/api/v1/cronograma`: `preparar_equipes`, `gerar_rascunho`, `publicar`, `abrir_inscricoes`, `encerrar_inscricoes`, `revisar`, `liberar_operacao`, `materializar_no`. Se liberação for um estado derivado em vez de ação persistida, registrar a decisão e comprovar o mesmo aceite no servidor.

Consultas distinguem revisão de trabalho, publicação ativa/suspensa, compromissos, pendências e aptidão. O aluno recebe somente dados autorizados da edição e opções da própria turma, sem elenco de outras turmas. Escrita de cronograma permanece nos níveis 0/1 onde já autorizada; aluno/mesário não ganham ações administrativas. Não reduzir nem ampliar papéis por inferência do nome do botão.

Definir erros de domínio seguros com `success=false`, `code`, `message` e detalhes de conflito autorizados. Proposta: 422 para payload inválido; 409 para revisão obsoleta, conflito, lotação ou estado incompatível; autenticação/autorização/CSRF seguem middlewares existentes. Alteração desses contratos exige atualizar testes e consumidores, sem retornos de erro com `success=true`.

Painel tem ações independentes para publicar, abrir, encerrar e revisar, campos de período e acesso às pendências/operação. Alterar parâmetros invalida prévia e desabilita publicação. Após sucesso parcial, erro ou resposta inesperada, reconciliar com GET; não repetir publicação para tentar abrir inscrições. HTML 200, JSON inválido e envelope sem confirmação esperada são falha, não sucesso. Duplo clique não duplica comandos.

Portal envia os tokens que exibiu ao aluno. Se houver conflito de revisão, preserva escolhas, atualiza disponibilidade e exige nova confirmação sem trocar equipe automaticamente. Usar classes/componentes compartilhados, foco/teclado e anúncios de estado; antes de estilizar, registrar tokens existentes de cor, tipografia, espaçamento, raios, sombras, estados e breakpoints. Não criar CSS novo ou inline.

## 5. Arquitetura e concorrência

Extrair políticas puras de estrutura, publicação e disponibilidade para Domain, reusando equivalentes existentes. Application coordena preparação, publicação, inscrição e operação com `TransactionRunner`; Infrastructure mantém consultas, locks e persistência. Composição explícita em `config/routes.php`. Não deslocar SQL para o serviço nem criar um segundo motor de resultados.

Definir ordem única de locks a partir do inventário: edição antes dos recursos, IDs em ordem estável, conciliando locks atuais de locais/modalidades e sincronização. Toda operação concorrente relevante deve participar. Confirmar revisão depois de adquirir lock e ler estado atual; impedir decisão baseada em snapshot anterior à espera. Restrição única completa protege preparação/materialização; erro intermediário desfaz vínculos, jogo, avanço, pontos e confirmação idempotente conforme o caso.

## 6. Offline

Planejamento e inscrição são online; recusar enfileiramento automático dessas ações. Atualizar todos os produtores/consumidores do novo formato juntos, sem suportar filas de versões antigas do software. Para operações produzidas pelo contrato final, preservar payload, operador, identidade e ordem nos reenvios; renovar CSRF pelo fluxo existente.

Preparo do mesário registra publicação/revisão e estado operacional. Na reconexão, detectar agenda suspensa ou revisão diferente, apresentar necessidade de atualização e preservar mutações pendentes para sincronização/revisão. Não afirmar que um dispositivo desconectado conhece revisão posterior. Resultados de jogos cuja identidade e participantes permanecem válidos seguem a regra de reenvio existente; divergência relevante deve retornar erro recuperável com fila preservada. Testar essa decisão no servidor e no navegador.
