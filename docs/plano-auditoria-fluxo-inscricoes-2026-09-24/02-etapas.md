# Etapas de implementação

O usuário autorizou iniciar a implementação. E01–E05 têm mudanças parciais no checkout; E06 e a validação automatizada continuam pendentes por instrução do usuário.

## E00 — fixar contexto e proteger o que já funciona

Conferir AGENTS, checkout, rotas, migrations atuais e todos os escritores de planejamento. Preservar as mudanças preexistentes. Usar os diagnósticos anteriores como histórico, não como prova do estado implantado.

Quando a organização fornecer o incidente, registrar URL/edição sem dados pessoais, versão efetivamente servida e dos assets, horário/fuso, papel, sequência, mensagem e estado antes/depois. Não exigir esses dados para corrigir D01 e as demais inconsistências identificadas no código. Não presumir que o servidor dos alunos usa este HEAD.

Mapear rascunho → publicação → inscrições → revisão → nova publicação e caminhos laterais de modalidades, turmas, equipes, locais e agenda. Entrega: mapa de escritores e política de locks/transições. Depois de retirada a restrição de testes, registrar baseline relevante antes de implementar; refatorações exigem baseline completo conforme AGENTS.

## E01 — corrigir o conflito falso da segunda publicação (D01)

Criar regressão com um mesmo aluno inscrito legalmente em duas modalidades, em horários separados, antes de repetir a publicação. Incluir dias diferentes, conflito verdadeiro, fases condicionais e preservação de inscrições. Ajustar a regra de publicação para usar interseção de participantes e tempo. Compartilhar a regra temporal de domínio com inscrição sem introduzir dependências de infraestrutura em Application/Domain.

Aceite: segunda e terceira publicações passam sem alterar vínculos; sobreposição real falha e conserva a publicação anterior.

## E02 — fechar transições laterais e sincronizar preparo (D02, D04, D07)

Proteger configuração de modalidade e demais escritores com o contrato de estado, revisão e transação. Diferenciar alteração efetiva de reenvio idêntico. Manter imutabilidade da árvore depois de liberada e versionar mudanças antes dela, inclusive durante revisão. Não resolver apenas escondendo controles.

Detectar quantidade/limites/preparo divergentes e orientar Preparar equipes antes de gerar. Uniformizar seleção de participantes entre gerar/publicar/liberar. Revisar inativação e transferências para não deixar equipes órfãs na cobertura. Implementar encerramento explícito de publicação fechada e bloquear estados impossíveis.

Aceite: uma modalidade criada/salva não retira a liberação; salvar igual não suspende inscrições; outra aba não publica proposta obsoleta; republicação com elencos completos pode seguir para encerramento/liberação sem abertura artificial.

## E03 — garantir a agenda contra restrições reais (D08, D09)

Revalidar ocupações atuais na publicação com locks consistentes; tratar somente a versão de planejamento aplicável como reserva ativa. Preservar bloqueios independentes. Corrigir busca do próximo início livre para não saltar a única vaga. Definir política de intervalo/descanso e uso de múltiplos locais de modo coerente entre geração e publicação.

Aceite: proposta antiga com nova reserva falha antes de publicar; histórico desocupado não bloqueia horário; janela mínima 08:15–08:35 do diagnóstico é encontrada; conflitos reais e concorrência continuam protegidos.

## E04 — tornar o calendário uma prévia utilizável (D03)

Antes de alterar aparência, planejar componentes/estados/tokens com a base visual existente. Integrar rascunho e publicação à grade usando contratos atuais ou projeção pública específica se necessário, mantendo autorização e escopo. Reconciliar com jogos físicos por identidade, sem fabricar jogos temporários operáveis para a administração.

Atualizar lista, calendário, filtros e estado na mesma página. Explicar versão suspensa durante revisão; não mostrar histórico como calendário ativo. Incluir pendências identificáveis por modalidade/nó, evitando apenas contagens e mensagens repetidas.

Aceite: é possível conferir horários antes da publicação, ver a nova versão sem reload e liberar sem duplicar compromissos. Validar desktop, celular, teclado e reentrada da página.

## E05 — orientar inscrições e acesso pelo perfil (D05, D06)

Implementar chamadas visíveis no perfil/início e distinguir “Inscrever-se” de “Consultar minhas inscrições”. Exibir janela/situação efetiva e bloqueios com motivo. Restaurar datas persistidas no painel administrativo. Tratar revisão antiga no portal com atualização e reconfirmação, preservando a proteção do backend.

Aceite: um aluno chega do perfil às modalidades sem conhecer URL; entende quando precisa aceitar termos, aguardar abertura ou atualizar a agenda; pode retornar e adicionar uma segunda modalidade legalmente.

## E06 — validar jornada completa e alinhar os roteiros

Executar a [matriz](03-validacao.md) somente quando a restrição de testes tiver sido alterada. Os testes de regressão devem ser escritos com a implementação, mas permanecem sem execução até autorização. Priorizar regressões, depois gate completo com visual e motores pertinentes ao SQL. Inspecionar falhas reais; não relaxar asserts nem remover proteção para concluir etapas.

Atualizar manual/roteiro de homologação após a interface estar comprovada, preservando o trabalho em andamento nesses arquivos. Incluir uma rodada administrativa com inscrições já existentes em duas modalidades antes da revisão; só depois liberar e operar a competição.

Entregar comandos/resultados, versão, ambiente, horários, logs, limitações e itens pendentes. Não fazer push/deploy como parte deste plano. Não declarar “resolvido definitivamente” sem demonstrar todos os aceites e comparar a versão homologada com a implantada.
