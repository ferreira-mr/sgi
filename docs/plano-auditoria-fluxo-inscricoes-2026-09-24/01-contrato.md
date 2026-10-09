# Contrato esperado

## Estados e repetição

Manter um único contrato de transições, aplicado no servidor e projetado na interface. Não usar apenas “inscrições não abertas” como equivalente a encerradas. Publicar, revisar e preparar não podem reabrir uma competição já liberada por caminhos laterais.

| Estado confirmado | Ações e orientação |
| --- | --- |
| Carregando, consulta falhou ou resultado desconhecido | Consultar/reconciliar; não repetir mutação sem conhecer o resultado |
| Rascunho/revisão + fechadas + não liberada | Preparar; gerar após preparo atual; publicar apenas proposta atual, completa e válida |
| Publicado + fechadas + não liberada | Abrir com janela válida, encerrar explicitamente sem nova abertura, ou revisar; não liberar ainda |
| Publicado + abertas + não liberada | Mostrar situação temporal efetiva; encerrar ou revisar com explicação do fechamento das inscrições |
| Publicado + encerradas + não liberada | Reabrir com janela válida, revisar ou liberar se todos os elencos/restrições estiverem válidos |
| Publicado + liberada | Consultar e operar jogos; não substituir árvore nem retirar liberação pela configuração |

Repetir uma intenção já aplicada deve ter resposta idempotente quando cabível. Não comparar só `affected_rows`. Revisão antiga, janela inválida e conflito real devem ter motivos distintos, dados suficientes para orientar a correção e nenhuma gravação parcial.

Antes da ação Liberar, explicar que ela cria os confrontos e encerra o ciclo de revisão da árvore. Não chamar a publicação de “liberação das inscrições”. Se houver confirmação no produto, ela deve explicar essa consequência concreta, sem acrescentar confirmações genéricas a cada botão.

## Publicação e integridade

- O mesmo aluno pode participar de até três modalidades compatíveis. Conflito temporal exige comparar datas e intervalos, inclusive compromissos condicionais. Pertencer a duas equipes, isoladamente, não é conflito.
- Preparação, geração e publicação devem utilizar a mesma definição de modalidades/turmas/equipes elegíveis, quantidade por turma e mínimo/máximo de elenco. Se a configuração mudar, indicar preparo/rascunho desatualizado.
- Mudanças estruturais efetivas precisam invalidar a proposta mesmo em rascunho/revisão e entre abas. Definir revisão de configuração ou outro identificador verificável de dependências; não basta assinatura de campos locais no JS. Salvar valores idênticos não deve fechar inscrições nem incrementar versão.
- Publicação revalida proposta, inscrições existentes, reservas externas, jogos e locais dentro da transação. Manter ordem de locks consistente com os demais escritores e rollback integral.
- Snapshot histórico permanece consultável, mas não ocupa horário de publicação substituída. Guardas de agenda devem distinguir histórico, versão vigente, reserva independente e jogo materializado.
- Após liberação, criação/alteração estrutural que afetaria a árvore deve ser recusada antes de escrever. Campos meramente descritivos podem ter política própria explícita, sem redefinir a operação. Auditar consumidores de `operacao_liberada`, pois retirar esse sinalizador afeta também as guardas dos jogos.
- Nenhuma correção pode apagar inscrições, jogos, resultados, filas offline ou snapshots para fazer uma segunda execução passar.

## Calendário verificável

A organização precisa ver modalidade, equipes/candidatos, fase, dia, início, fim e local **antes** de publicar. A grade deve indicar se apresenta rascunho, versão vigente ou publicação suspensa em revisão. Rascunho com pendências pode ser visualizado, mas não publicado.

Usar identidade estável de nó/compromisso e vínculo com jogo físico para não duplicar eventos na materialização. BYE é avanço sem jogo; fase condicional deve ser identificada. A liberação e os resultados não podem apagar compromissos futuros da visualização administrativa.

Depois de preparar, gerar, publicar, revisar ou liberar, atualizar as projeções afetadas na mesma página. “Atualizar estado” deve reconciliar também a visualização que depende desse estado. Se a consulta da grade falhar depois de gravação confirmada, informar separadamente o sucesso da operação e a falha de atualização; não repetir a gravação.

## Inscrição do aluno

Oferecer no conteúdo do perfil e no início uma ação textual para inscrição/consulta, além do menu. Preservar edição, categoria, gênero, turma, limite, termos e autenticação. Perfil administrativo de um aluno não deve se transformar silenciosamente em sessão de inscrição daquele aluno.

Mostrar a situação efetiva do período usando o relógio e fuso de referência do servidor: cronograma não publicado, suspenso em revisão, abertura futura, aberto agora, expirado, encerrado ou competição liberada. Diferenciar isso de falta de modalidades elegíveis, vagas esgotadas e limite pessoal atingido.

Ao detectar republicação, preservar as escolhas locais como intenção, buscar a nova agenda e solicitar nova revisão pelo aluno antes de salvar. Manter o bloqueio de revisão antiga na API. Não reenviar automaticamente a mesma escolha com a nova versão.

Reutilizar o design system e estilos compartilhados; não criar CSS novo ou inline. Os rótulos e explicações precisam funcionar no celular, por teclado e em leitores de tela. O manual deve refletir a interface entregue, sem exigir que o aluno adivinhe um ícone ou conheça URLs.
