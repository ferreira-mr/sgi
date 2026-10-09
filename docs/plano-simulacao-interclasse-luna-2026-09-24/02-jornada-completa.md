# 02 — Jornada integral da edição

Cada etapa termina com checkpoint consultável por HTTP e, na execução de navegador, na interface. Falha de pré-condição impede prosseguir naquele cenário; etapas seguintes ficam **bloqueadas**, nunca aprovadas por ausência de execução. Casos auxiliares podem continuar em recursos isolados para ampliar o diagnóstico.

## S00 — Ambiente e abertura do livro

1. Runner cria projeto Compose, banco, servidor, sessões, uploads e diretórios de relatório isolados.
2. Validar `TestDatabaseSafety`, runtime `container` e identidade da base pela saúde HTTP antes de qualquer fixture.
3. Registrar revisão, checkout modificado, hash do manifesto, semente, horário/fuso e URL efetiva.
4. Criar clientes independentes para administrador, colaborador e dois mesários; alunos terão sessões próprias. Login e CSRF pelo fluxo normal.
5. Preparar uma edição auxiliar para isolamento/autorização; preservar a edição ativa anterior da suíte e restaurá-la no fim, inclusive em falha, sem apagar evidências.

**Esperado:** ambiente inequívoco e nenhuma conexão com base de trabalho; nenhuma prova de competição é presumida pela página de login.

## S01 — Organização da competição

Criar edição pelo administrador, ativá-la quando necessário e conferir as 7 salas/2 categorias/10 modalidades. Configurar valores de pontuação, regulamento sintético, locais, limites de equipe, duração e descanso. Conferir 35 pares lógicos turma/modalidade: 21 representações coletivas e 14 vagas individuais. Como o contrato individual exige uma equipe de um atleta por vaga, o armazenamento operacional contém 35 equipes padrão mais 14 equipes individuais, 49 linhas ao todo. Repetir preparo idêntico e conferir estabilidade de IDs e contagens.

Conferir permissões concretas do colaborador e negar ações exclusivas de administrador. Mesário não pode preparar equipes, mudar edição, publicar cronograma ou criar prova individual. Aluno não pode operar nenhuma dessas ações via requisição direta.

**Esperado:** todas as modalidades ativas prontas para planejamento; nenhuma turma apagada para facilitar a agenda.

## S02 — Cadastro dos 224 alunos

Gerar PDF sintético de 32 alunos de uma turma e importar pelo fluxo real, com preview/confirmação se o contrato oferecer. Cadastrar os outros 192 pelo caminho administrativo existente. Se a importação produzir dados incompletos, completar pelo fluxo suportado antes das inscrições. Reimportação, arquivo inválido e matrícula duplicada ficam em cenários controlados.

Conferir 32 alunos únicos/ativos por turma e gênero sintético correto. Criar uma matrícula igual em outra edição auxiliar e comprovar unicidade por edição. Verificar que a importação não altera alunos de outra turma/edição e que erro de arquivo não deixa carga parcial indevida.

**Esperado:** 224 alunos aptos ao primeiro acesso; nenhuma matrícula, PDF ou foto de pessoa real.

## S03 — Planejamento e primeira publicação

Gerar rascunho completo com locais disponíveis, intervalos e candidatos às fases futuras. Comparar lista, prévia do calendário, árvore e slots. Conferir 15 confrontos reais, 4 sessões individuais e 3 byes, com contagens de representação separadas. Publicar e abrir inscrições na janela adequada, capturando revisão e identidade da publicação.

Ensaiar em ramo auxiliar: janela impossível, local indisponível, reserva criada entre geração/publicação, proposta obsoleta de outra aba, choque de equipes/alunos e falta de equipes preparadas. Recusas devem conservar a publicação anterior e não criar jogos operáveis antes da liberação.

**Esperado:** agenda publicada cobre todas as modalidades; não há conflito real nem bloqueio falso de horários distintos.

## S04 — Inscrições de todos os alunos

Na execução HTTP, cada aluno usa seu `TestClient` próprio. Na execução de navegador, cada um dos 224 realiza login pelo formulário, troca inicial de senha quando exigida, aceite de termos, acesso pelo perfil/início, seleção de modalidade/equipe, conferência de agenda e confirmação. Não substituir esses passos por autenticação administrativa ou preenchimento do banco.

Distribuir a jornada em três ondas: primeira modalidade dos 224; retorno dos 84 alunos que terão ao menos duas; retorno dos 14 que terão três. Os 84 retornos correspondem a 70 alunos com duas e 14 com três. A escolha da modalidade de cada onda deve respeitar a tabela do manifesto, não a ordem de resposta da API.

Entre ondas, conferir totais esperados 224 → 308 → 322, número de modalidades por aluno, capacidade de cada equipe e ausência de vínculos duplicados. Fazer logout/login real nos retornos selecionados e navegar perfil → inscrições → agenda → perfil. Cobrir celular e desktop com ao menos dois alunos de cada turma, incluindo um com três modalidades por turma; os demais podem usar um viewport fixo.

Casos negativos isolados: termos pendentes, senha inicial pendente, inscrições fechadas/expiradas, quarta modalidade, equipe lotada, gênero/categoria incompatível, edição alheia, revisão antiga, conflito temporal, duplicidade e envio adulterado de ID de aluno. Para quarto vínculo, usar edição auxiliar com quatro modalidades compatíveis; não confundir recusa por gênero com limite de três. Conferir mensagem, status contratual e zero efeitos parciais.

**Esperado:** os 224 acessaram e se inscreveram, 322 vínculos, 140/70/14 alunos em uma/duas/três modalidades. Não aprovar apenas porque a soma final coincide.

## S05 — Revisão e segunda publicação com elencos completos

Encerrar a primeira janela, revisar planejamento e gerar proposta que mantém horários separados de alunos inscritos em duas/três modalidades. Publicar segunda e terceira versões, reabrir/encerrar conforme o fluxo suportado. Validar uma tentativa feita a partir de tela estudantil com revisão antiga, exigindo atualização e reconferência.

Comparar os 322 vínculos e seus IDs antes/depois; não reinscrever alunos para mascarar perda. Verificar calendário administrativo, agenda individual e nomes/horários atualizados na mesma página. Proposta conflitante deve falhar sem apagar a válida. Salvar configuração idêntica não pode invalidar desnecessariamente o planejamento.

**Esperado:** elencos preservados, nenhum falso conflito causado apenas por aluno pertencer a duas equipes em horários distintos, nenhum compromisso duplicado de versão histórica.

## S06 — Encerramento das inscrições e liberação

Reconciliar lotação, termos, 224 alunos e 322 vínculos; encerrar inscrições e liberar operação. Conferir correspondência entre árvore publicada, jogos materializados e candidatos futuros. Repetir liberação e comparar identidades para detectar duplicação.

Tentar alterar estrutura/quantidade de equipes ou substituir árvore depois da liberação e verificar recusa e estado intacto. Ensaio de elenco incompleto ocorre em ramo próprio antes da liberação, sem reduzir os mínimos do principal.

**Esperado:** jogos prontos para o mesário na edição ativa e inscrições encerradas sem perda.

## S07 — Rodadas coletivas online

Operar todos os confrontos não reservados ao trecho offline. Em cada um: abrir pela agenda, conferir categoria/modalidade/equipes/atletas, iniciar, pausar/retomar cronômetro em casos selecionados, lançar pontos do roteiro, registrar ocorrência programada, anular ponto equivocado quando previsto e confirmar resultado.

Na execução de navegador, usar controles visíveis para todos os pontos e resultados. Distribuir autoria entre titulares/reservas do elenco, sem inventar substituição tática como função do SGI. No vôlei/queimada, registrar a unidade de pontuação efetivamente suportada. Não esperar o tempo esportivo real para concluir o teste.

Após cada partida: resultado persistido, eventos ativos e anulados, autoria, placar, artilharia/destaques, vencedor, próximo nó, agenda e créditos de pódio quando aplicáveis. Dois mesários devem operar partidas distintas permitidas; disputa pelo mesmo recurso é testada com barreira separada.

**Esperado:** 15 confrontos coletivos ao somar trecho online e offline; nenhum gol de bye, avanço duplicado, órfão ou jogo fictício de campeão.

## S08 — Trecho real offline e reconexão

Reservar uma chave completa de 4 equipes da categoria II para o mesário A: preparar online os dados e a mesma aba; usar `context.setOffline(true)`; operar as duas semifinais e a final derivada localmente, com pontos vinculados, ocorrência e anulação. Validar IDs negativos e dependência da final quando a implementação realmente produzir jogo temporário. Se o fluxo atual já materializar todos os jogos, cobrir resolução negativa em cenário auxiliar compatível, sem alterar banco para forçar a forma desejada.

Enquanto A está offline, mesário B opera outra modalidade online. Conferir que os dados pendentes de A ainda não foram confirmados no servidor, embora a UI local apresente sua projeção. Navegar pela casca preparada e reentrar no placar; listeners/timers não devem duplicar eventos.

Restaurar rede; aguardar confirmação reconhecida de cada mutação e consultar o servidor com sessão observadora. Comparar fila principal `sgi_offline/mutation_queue`, cache e projeções de `sgi_mesario_dados`, incluindo `fila_sincronizacao`, sem confundir as stores. Final e semifinal devem convergir para IDs reais e eventos únicos.

Executar ramos adicionais com rede oscilante, resposta perdida **depois** de commit, reenvio da mesma chave, mesma chave com payload diferente/operador diferente, CSRF renovado, sessão expirada/revogação de permissão e duas abas disputando envio. HTTP 200 com HTML, JSON inválido e envelope de erro devem manter operação revisável; usar interceptação só para provocar falha, não para simular sucesso do backend.

**Esperado:** cada efeito confirmado uma única vez, erros preservados para revisão e nenhuma perda de pendência. Login frio, refresh ou nova aba sem rede são limites documentados; não constituem fluxo suportado a ser artificialmente aprovado. Não limpar IndexedDB para recuperar cenário.

## S09 — Quatro provas individuais

Operar corrida masculina/feminina de ambas as categorias, conferir todos os 28 vínculos de participantes e registrar os pódios congelados. Verificar seleção de atletas, três posições distintas e elegibilidade. Em um ramo, tentar repetir atleta em duas posições e usar não inscrito/de outra categoria/edição; nada deve ser creditado.

Exercitar reenvio e retificação de pódio pelo contrato suportado, incluindo dois atletas da mesma turma, e conferir deltas. Operar ao menos uma prova na mesma aba preparada sem rede e reconciliar com o servidor quando esse fluxo estiver disponível; uma ausência de suporte deve ser registrada como lacuna, não coberta por mock de sucesso.

**Esperado:** quatro sessões com pódios consistentes, sem duplicidade de jogo ou crédito; tempos externos não são apresentados como medição feita pelo SGI.

## S10 — Arrecadações e disciplina ao longo dos dias

Intercalar os eventos de C06 com S04–S09, em vez de lançar tudo só no fim. Administrador/colaborador realiza arrecadação; mesário autorizado registra ocorrências da partida; aluno consulta somente dados permitidos. Após cada onda, conferir ranking interno e histórico de cada turma.

Testar penalidade positiva, zero conforme contrato, negativa recusada, valor inválido, edição alheia, descrição escapada e alteração de status. Cartões amarelo/vermelho/suspensão devem constar do roteiro nos tipos aceitos. Conferir se suspensão interfere realmente na elegibilidade; caso não interfira, registrar a limitação, sem alegar que houve bloqueio esportivo.

Tentar estorno duas vezes, quantidade insuficiente, valor com precisão inválida e acesso não autorizado. Confrontar total de itens, histórico, créditos e líquido após cada operação. Aplicar a penalidade somente uma vez.

**Esperado:** todas as sete turmas têm histórico; totais finais C06, com trilha de correções e cancelamentos.

## S11 — Premiação, publicação e encerramento

Reconciliar os dez pódios, todas as turmas, eventos, arrecadações e penalidades antes de publicar. Consultas antes da publicação não podem vazar classificação reservada ao aluno/público. Executar publicação/revogação/republicação pelas ações suportadas e conferir o efeito nos perfis corretos.

Encerrar/desativar a edição pelo contrato atual e verificar consulta histórica. Separar isso da liberação do ranking: encerramento não presume publicação. Tentar mutações de mesário na edição fora de operação, troca da edição ativa e replay pendente da sessão antiga em cenário auxiliar; não aplicar na edição errada.

Todos os 224 alunos devem consultar seu estado final pelo caminho permitido; verificar ausência de mutações novas e identidade da turma. Cobrir também admin, colaborador, mesário e não autenticado. Registrar a posição final de todas as turmas e campeões por modalidade/categoria.

**Esperado:** resultado final bate com o livro; visão pública/estudantil respeita publicação; histórico permanece íntegro.

## S12 — Auditoria final e repetição

Conferir inventário esperado versus realizado: alunos únicos, inscrições por aluno/equipe, partidas, provas, créditos, eventos anulados, ocorrências, estornos, pendências e recusas. Reenviar operações selecionadas e comprovar ausência de novos efeitos. Comparar saldo por origem, não somente valor total.

Executar novamente em ambiente limpo com a mesma semente: aliases, roteiro e resultados normalizados devem coincidir, descontando IDs físicos, datas-base, `run_id` e durações. Comparar a execução HTTP integral e a de navegador contra o mesmo esperado independente. Preservar evidências antes da limpeza do runner.

**Esperado:** relatório completo e reproduzível; nenhuma fila perdida, recurso externo alterado ou aprovação de etapa não executada.
