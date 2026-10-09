# Diagnóstico do checkout

As linhas citadas correspondem ao HEAD e checkout descritos no README deste pacote. Todos os cenários são deduções do código, não execuções realizadas nesta auditoria. P1 indica correção prioritária de comportamento/integridade; P2 indica orientação, estado ou planejamento incorreto com alcance mais limitado.

## D01 — republicação recusa aluno com duas modalidades sem conflito de horário — P1

**Evidência:** `src/Modules/Competicoes/Infrastructure/MysqliCronogramaRepository.php:1224`, `validateCommitments()` e `hasEnrolledStudentConflict():1264`.

A publicação percorre pares de compromissos e procura alunos em equipes distintas dos dois nós. Se encontrar, lança “O cronograma conflita inscrições existentes de um mesmo aluno” **antes de comparar data/início/término**. A consulta só verifica vínculos em `equipes_has_usuarios`; não recebe horários. Já a inscrição em `MysqliInscricaoRepository::assertScheduleCompatibility()` compara os horários com `CronogramaRules::schedulesConflict()`.

**Cenário:** publicar duas modalidades em horários separados; um aluno inscreve-se nas duas; revisar; gerar a mesma grade; republicar. A primeira publicação não tinha os vínculos, a segunda tem. Mesmo mudar os jogos para dias diferentes não elimina a recusa atual. É o candidato mais diretamente compatível com “na segunda vez dá errado”, condicionado a esse cenário ter ocorrido.

**Correção:** conflito exige aluno em comum **e** sobreposição temporal conforme regra explícita. Manter a recusa de sobreposição real, inclusive fases condicionais. Não excluir inscrições para permitir publicar.

## D02 — configuração de modalidade contorna o bloqueio pós-liberação — P1

**Evidência:** `src/Modules/Competicoes/Infrastructure/MysqliModalidadeRepository.php:212`, especialmente `savePlanning():261`; `ModalidadeService::atualizar()` e `ModalidadeController::update()` não acrescentam guarda de operação liberada.

Salvar campos de planejamento executa `UPDATE interclasse_planejamentos SET cronograma_status='revisao', inscricoes_status='fechadas', operacao_liberada=0, cronograma_versao=cronograma_versao+1 ... AND cronograma_status='publicado'`. Não compara os valores antigos com os novos nem verifica `operacao_liberada`. O mesmo caminho é chamado ao criar modalidade com planejamento, inclusive pelo formulário administrativo.

**Cenários:** depois de publicar/abrir inscrições, reenviar configuração idêntica pela API já pode fechar as inscrições; depois de liberar a competição, salvar planejamento ou criar modalidade planejada faz voltar a revisão e retira a liberação. O método `review()` recusa essa transição, mas este outro escritor a permite. Jogos e resultados existentes não são removidos: passam a coexistir com um estado administrativo que permite planejar de novo. Não se afirma que os alunos acionaram esse caminho.

Em rascunho/revisão, alterações de planejamento não incrementam a revisão por esse `UPDATE`. Uma proposta gerada em outra aba pode continuar com o mesmo número apesar da mudança de configuração.

**Correção:** proteger todos os escritores, não apenas o botão Revisar. Alteração sem efeito deve ser idempotente. Alteração estrutural efetiva precisa de transição/versionamento atômicos antes da liberação e recusa após ela. Preservar jogos, resultados e filas. Auditar também ativação/inativação, categoria, turma e local que afetem a grade.

## D03 — calendário administrativo não apresenta o rascunho/publicação — P1

**Evidência:** `resources/js/pages/eventos/configurar-agenda.js:185`, `:871`, `:897`, `:992`; `src/Modules/Competicoes/Infrastructure/MysqliJogoGateway.php:25`.

O calendário e a lista usam `jogosCache`, carregado de `/api/v1/jogos`. Esse endpoint consulta jogos físicos. O rascunho fica apenas em `cronogramaRascunho`; a UI mostra contagens, sem projetar seus compromissos na grade. O GET de cronograma recebe nós/compromissos, mas `mostrarCronograma()` atualiza somente badge/resumo/botões. Publicar/revisar/liberar e “Atualizar estado” não recarregam `jogosCache` nem integram o planejamento à grade.

**Efeito:** antes da liberação, uma edição nova pode mostrar calendário vazio apesar de publicação bem-sucedida. Depois de liberar, os jogos criados podem continuar ausentes na mesma página até recarregar. Recarregar não resolve a ausência da prévia antes da materialização. O [manual em elaboração](../manual-usuario/03-agenda-e-inscricoes.md), seção 3, manda revisar compromissos no calendário, comportamento que este código não oferece.

**Correção:** apresentar prévia do rascunho, publicação vigente e jogos operacionais com origem/revisão explícitas; mostrar fases condicionais e BYEs adequadamente; reconciliar após mutação. Não criar jogos físicos só para preencher o calendário nem duplicar um compromisso quando ele vira jogo.

## D04 — “Liberar competição” habilitado em estado que o servidor recusa — P2

**Evidência:** `configurar-agenda.js:854–855`; `MysqliCronogramaRepository::publish():284`, `releaseOperation():359` e `closeRegistrations():327`.

Publicar deixa inscrições `fechadas`. A UI habilita Liberar sempre que não estão `abertas`, mas o servidor exige precisamente `encerradas`. Encerrar, por sua vez, só fica habilitado quando estão `abertas`.

**Cenário:** publicar ou republicar com elencos já completos e tentar liberar. O servidor pede encerramento; a tela não oferece Encerrar nesse estado. O usuário precisa abrir e fechar uma janela desnecessária para seguir pela UI. Chamadas diretas de encerramento também não validam o estado do cronograma, podendo deixar um rascunho como `encerradas`; a UI permite Gerar por “não abertas”, enquanto o backend exige `fechadas`.

**Correção:** diferenciar `fechadas` de `encerradas` em todas as transições e derivar ações da mesma tabela. Permitir encerramento explícito de uma publicação fechada quando não se deseja reabrir inscrições; não habilitar liberação prematura. Recusar encerramento de rascunho/revisão pela API sem deixá-los num estado impossível.

## D05 — janela de inscrição e revisão do aluno ficam pouco claras/desatualizadas — P2

**Evidência:** `CronogramaService::abrir():64`, `CronogramaRules::assertPlannedEdition():69`, `configurar-agenda.js:871` e `:1028`; `resources/js/pages/aluno/modalidade.js:45`, `:436` e `:810`; configuração JSON em `resources/views/pages/aluno/modalidade.php`.

A abertura valida início anterior ao fim, mas aceita janela já passada. O badge administrativo mostra `abertas` sem considerar relógio; a inscrição corretamente recusa antes do início ou após o término. Os campos de janela não são preenchidos com o GET persistido ao reabrir a página. O aluno recebe revisões como constantes da renderização PHP; a consulta de agenda é armazenada em cache e não atualiza essas revisões no salvamento. A tela de seleção não usa a janela efetiva para explicar disponibilidade antes da tentativa.

**Cenários:** repetir o roteiro em outro dia com as mesmas datas gera “abertas” para o administrador e “período terminou” para o aluno; manter o portal aberto enquanto o administrador republica provoca recusa por revisão antiga. A recusa de revisão antiga é correta, mas falta uma recuperação orientada que apresente a agenda nova antes de novo consentimento do aluno.

**Correção:** exibir período/fuso e situação efetiva (programadas, abertas agora, expiradas, encerradas ou suspensas), restaurar valores persistidos sem sobrescrever edição local, impedir anúncio de abertura atual com período expirado e oferecer atualização explícita após mudança de versão. Não trocar silenciosamente a revisão enviada por uma revisão que o aluno ainda não viu.

## D06 — inscrição existe, mas não é evidente a partir do perfil — P2 / usabilidade

**Evidência:** `resources/views/pages/aluno/perfil.php`, `resources/views/components/aluno-nav.php:29`, `:38`, `:51`; `resources/js/pages/aluno/home.js:37`; rota `/aluno/modalidades` em `config/routes/web.php`.

O perfil contém informações da conta, foto e senha, sem chamada direta para inscrição no corpo. O menu compartilhado tem “Inscrições”; no celular exige abrir o menu. O cartão da edição ativa no início leva à inscrição com o texto “Ver Detalhes”. Sem termos aceitos, o menu mostra apenas Termos por regra intencional.

**Conclusão limitada:** não falta a rota nem o item de navegação. O relato de não encontrar o caminho é compatível com baixa visibilidade, sobretudo no perfil/celular. Não foi observada a tela/dispositivo usado pelos alunos; não é possível atribuir ocultação indevida por CSS.

**Correção:** acesso textual “Inscrever-se em modalidades”/“Minhas inscrições” no perfil e início, preservando a edição e os pré-requisitos. Quando indisponível, explicar o motivo e o próximo passo. Não retirar aceite de termos nem autenticação.

## D07 — equipes preparadas podem divergir da configuração no segundo ciclo — P1

**Evidência:** `MysqliCronogramaRepository::prepareTeams():49`, `generateDraft():153`, consulta de equipes em `generateDraft()` e `validateCommitments():1212`.

A geração verifica quantidade planejada positiva e existência de equipes, mas não confere a quantidade por turma nem se limites das equipes correspondem à configuração atual. Alterar a quantidade de 2 para 3, sem preparar novamente, permite gerar com as duas equipes antigas; a publicação cobre as equipes existentes e não detecta a terceira ausente. A preparação é que copia mínimo/máximo para `equipe_planejamentos`.

Há outra divergência: a geração seleciona apenas turmas ativas da categoria da modalidade; a cobertura da publicação exige todas as equipes ativas preparadas da modalidade, sem o mesmo filtro de turma/categoria. Se a turma/categoria mudar sem reconciliar equipes, uma proposta apresentada sem pendências pode ser recusada na publicação. A política de quais mudanças de turma são permitidas precisa ser conferida na implementação; não se afirma uma reprodução desse segundo caminho.

**Correção:** preparação deve produzir configuração verificável. Gerar/publicar devem detectar preparo desatualizado, elencos incompatíveis e turmas incluídas/excluídas com o mesmo universo de participantes. Não reduzir equipes com inscritos ou apagar histórico automaticamente.

## D08 — restrições externas não são revalidadas na publicação; histórico pode bloquear vagas — P1

**Evidência:** `MysqliCronogramaRepository::occupiedSlots():1367`, `publish():260`, `validateCommitments():1148`, `insertCommitments():1110`; `MysqliLocalScheduleGuard::conflictWithPublishedPlan():146`.

Gerar consulta reservas/jogos. Publicar valida conflitos internos da proposta e pertencimento/disponibilidade do local, mas não consulta novamente reservas/jogos externos nem trava os locais com a guarda compartilhada. Uma reserva/jogo criado após a geração pode ser ignorado na publicação. A liberação checa jogos materializados e pode acusar o problema só depois de o cronograma já ter sido anunciado. Reservas independentes também precisam continuar respeitadas.

Além disso, a guarda `conflictWithPublishedPlan()` consulta todos os registros de `cronograma_compromissos`, sem selecionar `versao_publicada` e estado. Snapshots antigos preservados podem bloquear operações de agenda que usam essa guarda mesmo quando o novo calendário já desocupou o horário. A geração da revisão já exclui sua publicação substituída; a guarda compartilhada não tem o mesmo contrato.

**Correção:** revalidação transacional das restrições atuais, ordem consistente de locks e seleção explícita da publicação válida. Histórico não é reserva ativa. Preservar reservas independentes e dados antigos para consulta; não apagá-los para esconder conflitos. Cobrir chamadas diretas e concorrência, não só controles visíveis na página.

## D09 — busca de horário pode pular a única vaga válida — P2

**Evidência:** `MysqliCronogramaRepository::nextDraftSlot():1318`, avanço após conflito em `:1360`.

Após uma tentativa com conflito, o cursor avança para o término da tentativa mais um minuto, em vez de procurar o primeiro início livre. Exemplo dedutivo: um local; janela 08:00–08:35; jogo de 20 minutos; reserva 08:00–08:05 e margem de 10 minutos. A vaga 08:15–08:35 cabe. O algoritmo tenta 08:00–08:20, falha, avança a 08:21 e rejeita por ultrapassar 08:35.

**Correção:** buscar limites efetivos de ocupação, respeitando intervalo e descanso; não aumentar a janela informada nem concluir “não cabe” após saltar uma vaga possível. O uso de vários locais também deve ter política explícita: atualmente há um cursor global, sem garantia de aproveitamento paralelo máximo.

## O que já está corrigido e deve permanecer

- Botões do painel são recalculados após operações e falhas; não há mais o bloqueio simples baseado em histórico de cliques do diagnóstico anterior.
- Revisão exclui os compromissos da publicação substituída na geração; pendências não são descartadas como erro genérico HTTP 200.
- Mudanças nos campos locais invalidam o rascunho; publicação usa a revisão da proposta; falha de atualização após POST confirmado tem tratamento específico.
- O caminho explícito `review()` recusa revisão após liberar. D02 é um escritor alternativo que rompe essa proteção.
- Inscrição valida versão, publicação, janela, capacidade e conflitos. Não flexibilizar essas guardas para mascarar os problemas da interface/publicação.

## Por que as suítes verdes são compatíveis com os achados

Somente leitura dos testes, sem execução: `tests/browser/cronograma-jornada-e2e.spec.cjs:323` repete publicações **antes** de inscrever alunos e usa uma modalidade no fluxo principal; não equivale a republicar depois de um aluno aderir a duas modalidades. `tests/Integration/CronogramaPlanejadoTest.php` preenche outras equipes criando estudantes distintos e testa uma inscrição conflitante recusada. `tests/browser/cronograma-planejado.spec.cjs` valida o painel com respostas controladas; contagens/badges não provam que a grade apresenta compromissos. Os novos aceites precisam medir os resultados que faltam, preservando toda a cobertura existente.
