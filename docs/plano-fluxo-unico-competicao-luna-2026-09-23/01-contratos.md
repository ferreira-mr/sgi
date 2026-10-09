# Contratos do fluxo único

## F01 — Uma árvore, antes das inscrições

Preparar equipes não exige alunos. Gerar calendário define uma única árvore por modalidade/categoria, com representantes das turmas elegíveis, e horários/locais para todos os confrontos físicos, inclusive fases condicionais. BYE estrutural não cria jogo físico. Uma árvore sem confronto possível deve produzir orientação explícita; não pode aparentar uma competição pronta com calendário vazio.

Publicar não exige elenco mínimo. Abrir inscrições exige publicação válida e janela explícita. O aluno vê os horários de suas opções antes de qualquer inscrição, incluindo possíveis fases seguintes. A inscrição continua validando elegibilidade, capacidade, conflitos, versões e limite de modalidades. Não flexibilizar regras para acomodar o novo fluxo.

## F02 — Estados e ações de produto

| Situação | Ação principal | Efeito |
| --- | --- | --- |
| Rascunho, inscrições fechadas | Preparar equipes / Gerar calendário | Montar e revisar a proposta, sem jogos operacionais |
| Proposta válida | Publicar calendário | Persistir árvore e compromissos; inscrições continuam fechadas |
| Publicado | Abrir inscrições | Abrir período explícito para escolhas dos alunos |
| Inscrições abertas | Encerrar inscrições | Encerrar novas escolhas e mostrar pendências de elenco |
| Inscrições encerradas, elencos aptos | Liberar competição | Criar jogos cujos participantes estão definidos e liberar operação |
| Competição liberada | Acompanhar chaveamento / Operar jogo | Registrar resultados e disponibilizar próximos jogos previstos |
| Revisão necessária | Revisar calendário | Suspender ações incompatíveis, preservar histórico e exigir nova validação |

Os rótulos de interface podem mudar sem renomear desnecessariamente campos persistidos. Não expor “materializar nó” como tarefa do administrador. Sem publicação, Chaveamento orienta para o planejamento e não oferece outra geração.

## F03 — Liberação integral e repetível

O caso de uso de liberação recebe edição e revisão, autentica/autoriza no servidor, bloqueia o planejamento na ordem comum e revalida publicação, encerramento, elencos, equipes elegíveis, agenda e locais. Não confiar em botões ou dados enviados pelo cliente.

Na mesma transação, cria ou reconhece todos os jogos imediatamente disponíveis da edição: confrontos com participantes definidos e provas individuais aptas. Participantes futuros não recebem IDs fictícios de equipes. Marca a operação liberada somente após sucesso. Uma falha em qualquer modalidade desfaz todo o lote novo e não deixa liberação parcial.

Repetir a liberação da mesma revisão, inclusive após timeout ou em chamadas concorrentes, retorna sucesso coerente e os mesmos jogos, sem duplicar partidas. Revisão obsoleta é recusada. Não tratar `affected_rows=0` isoladamente como erro. Etapas futuras continuam no calendário e na árvore com indicação de participantes a definir.

Equipes abaixo do mínimo impedem liberação, com lista acionável. Não cancelar equipe, sortear novamente, conceder vitória ou eliminar inscritos automaticamente. Mudança estrutural necessária passa por revisão explícita antes da operação.

## F04 — Identidade e agenda preservadas

Cada jogo operacional deve ter vínculo inequívoco com seu confronto planejado, edição e publicação; nome exibido não é chave suficiente. Garantir unicidade também no banco para impedir criação concorrente do mesmo confronto. Escolher o desenho com base no schema existente e registrar campos, índices e tratamento de registros existentes antes de editar.

Não assumir que `UNIQUE(id_no)` resolve revisões: uma nova publicação pode criar outro ID para o mesmo confronto. Mapear continuidade entre publicações ou bloquear a alteração incompatível, preservando IDs operacionais, pontos, resultados e referências offline. Nunca reconhecer jogo por `LIMIT 1` entre candidatos ambíguos.

Data, horário, local e participantes vêm do planejamento vigente autorizado. A própria reserva do confronto não impede sua criação; reservas alheias continuam impedindo. Não criar fase seguinte com horário nulo nem alocar em outro local por conveniência.

Migrações aplicadas são imutáveis. Se DDL for necessário, usar a próxima numeração disponível e testar instalação, atualização com dados, repetição e recuperação. Nunca resetar dados de trabalho.

## F05 — Avanço, resultado e modalidades individuais

O resultado usa os contratos atuais de pontuação, autoria, anulação, desempate e transação. A árvore publicada determina os próximos confrontos; o sistema resolve vencedores e BYEs recursivamente e cria o próximo jogo quando todos os participantes necessários estiverem definidos.

Sem vencedor válido, não há avanço. A final é terminal. Não criar campeão como jogo solo, novas disputas de posição ou novo pódio. BYE intermediário propaga o vencedor real da origem. Não escolher menor ID nem primeiro candidato.

Adaptar o motor existente para consumir a identidade/topologia canônica; não manter dois motores que escolhem adversários independentemente. Reprocessamento e correção de resultado preservam as restrições existentes: nunca apagar resultado/pontos de descendente já operado para acomodar um novo vencedor. Recusar alteração incompatível com explicação recuperável.

Preservar criação das provas individuais a partir do planejamento, registro de ranking e créditos. Distinguir formato de participação de tipo de competição; uma entrada individual/dupla não implica, por si só, prova por marcas. Não ampliar regulamento neste trabalho.

## F06 — Offline é projeção da mesma competição

O preparo online inclui nós, dependências, compromissos, revisão e vínculos operacionais necessários para seguir fases na mesma aba sem rede. O motor local resolve a árvore publicada e mantém IDs temporários negativos quando necessários; não faz novo sorteio nem inventa horários.

Reenvio conserva identidade da mutação, operador, dependências e autoria; o servidor associa o temporário ao mesmo confronto e confirma dados mais idempotência atomicamente. Resultado repetido não duplica jogo, ponto, ocorrência ou avanço. CSRF é renovado no envio.

Publicação revisada durante operação offline não autoriza descartar fila. Rejeitar operação incompatível de forma revisável e preservar payload/evidência; só remover após confirmação reconhecida. Mudanças de IndexedDB exigem migração/recuperação testada com fila pendente. Sem limpeza automática, refresh offline ou inscrição offline como solução.

## F07 — Uma porta de criação, inclusive por API

Retirar a geração inicial independente do produto e do servidor. Acesso direto ao antigo pedido de geração recebe erro controlado, sem escrever jogos. Pode manter resposta explicativa para orientar o chamador, sem executar outro fluxo ou criar árvore alternativa.

Manter consultas e mutações de resultado ainda legítimas no endpoint atual, especialmente ranking individual. Materialização por nó, caso permaneça pública, usa o mesmo caso de uso, restrições de revisão e unicidade; nunca permite operar antes da liberação. Preferir detalhe interno se nenhum consumidor legítimo precisar dela.

Criação manual de jogos, edição de horários, agenda em blocos e sincronização não podem gerar outra competição para uma modalidade planejada. Para cada rota, integrar ao mesmo contrato ou recusar a ação incompatível; preservar operações não relacionadas. Permissões, CSRF, sessão e isolamento de edição são conferidos no servidor.

## F08 — Revisões e experiência de uso

Prévia muda ou fica obsoleta quando configuração muda. Publicação e liberação usam a revisão lida e permitem recuperar de duas abas/timeout sem nova geração. A árvore pode ser consultada antes da existência de jogos; botões de placar só aparecem quando há jogo operável.

Revisar não apaga jogos, resultados ou fila. Alterações estruturais depois da liberação não serão automatizadas neste escopo: bloquear as que invalidem confrontos existentes. Ajustes permitidos de agenda preservam identidade e revalidam inscritos, reservas, operação e versão; se isso não for seguro no contrato atual, recusar explicitamente. Registrar essa política na interface e nos testes, sem deixar a decisão para inferências do frontend.

Estilos seguem o sistema compartilhado, sem novos CSS ou inline. Validar desktop/mobile, foco, teclado, contraste e reentrada pela casca offline, sem listeners/requisições duplicados.
