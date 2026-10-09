# Contrato de implementação

## Estado e ações

Derivar botões do estado recebido, validade do rascunho e operação em andamento. Nenhum botão depende de ter sido clicado anteriormente. Compartilhar uma função de atualização de ações, executada após carregar, mutar, falhar ou invalidar proposta.

| Estado | Ações do planejamento |
| --- | --- |
| Carregando ou resultado de mutação desconhecido | Consultar/reconciliar estado; bloquear mutações concorrentes |
| Rascunho/revisão, inscrições fechadas, não liberado | Preparar e gerar; publicar somente proposta atual, completa e válida |
| Publicado, não liberado | Revisar; abrir/encerrar conforme estado de inscrições e janela; liberar somente encerradas e com elencos aptos |
| Publicado e operação liberada | Consultar/operar competição; nenhuma regeneração ou substituição da árvore |

Explicar impedimentos na UI sem transformar todas as falhas em botão permanentemente bloqueado. O servidor continua autoritativo para papéis, edição, revisão e transições. Reabertura de inscrições só enquanto não liberado; validar a política no servidor, inclusive chamadas diretas. Repetição da mesma intenção já aplicada deve ser reconhecida ou recusada como conflito de domínio explícito, nunca interpretada como erro interno apenas por `affected_rows=0`.

## Proposta de rascunho

Manter proposta ligada a edição, revisão retornada pela geração e parâmetros usados. Invalidar ao mudar entradas relevantes, preparar equipes ou receber nova revisão. Publicar usando a revisão da proposta; comparar com o estado atual antes do envio, mantendo a conferência transacional no servidor. Não substituir a revisão da proposta pela última revisão carregada para contornar conflito.

Serializar ações mutáveis do painel. Impedir duplo clique de Gerar/Preparar e ignorar respostas de uma montagem já desativada ou de uma geração superada. Usar o ciclo de vida de `page-runtime.js`, sem listeners duplicados, e recursos compartilhados existentes. Se descartar uma resposta de POST não significar cancelar sua gravação no servidor, consultar o estado para reconciliar.

Proposta com pendências é diagnóstico de planejamento: manter informações suficientes para exibir motivo e contexto, sem habilitar publicação. Pode-se manter o contrato HTTP 200 com `success:false` da geração e tratá-lo especificamente, ou definir um contrato novo coerente e atualizar todos os consumidores/testes juntos. Não tratar falhas HTTP, HTML ou JSON inválido como sucesso.

## Revisão de agenda

A geração da revisão considera restrições independentes ainda válidas, mas exclui compromissos da publicação que está substituindo. Classificar reservas por origem e escopo, evitando excluir todos os compromissos/reservas da edição indiscriminadamente. Preservar snapshot anterior e inscrições da mesma versão de software. Não alterar relógio, aumentar janela automaticamente nem apagar registros para esconder falta de espaço.

A publicação revalida estado, revisão e restrições atuais dentro da transação; concorrência ou falha não deixam nós/compromissos parciais. Uma proposta obsoleta não pode sobrescrever publicação mais recente. Se inspeção mostrar falhas adicionais de validação de local/equipe/horário, adicionar regressão e corrigir na fronteira apropriada antes de concluir o contrato.

## Requisições e recuperação

O fluxo administrativo canônico usa `/api/v1/cronograma`. Retirar do painel os controles de programação independente em `/api/v1/agenda-blocos`; conferir outros consumidores antes de remover rotas/classes. Preservar operações atuais de resultados e consulta que não sejam geração paralela. Sem compatibilidade com formatos antigos do software.

POST confirmado e GET subsequente falhando: informar “operação concluída; atualização do estado pendente”, permitir nova consulta, não disponibilizar um Publicar sem proposta. Em timeout de POST, consultar o estado antes de reaplicar; nunca declarar sucesso apenas porque a rede voltou. Erros de domínio devem preservar contexto útil (`code`, status, mensagem, pendências) sem expor SQL ou dados sensíveis.

Raiz/subdiretório usam `SGI_API_BASE`/utilitários existentes; não criar URLs físicas `.php`. Manter CSRF, sessão, isolamento por edição e operação offline da versão nova. Sem redesenho geral; se forem necessários estilos, reutilizar design system e CSS compartilhado conforme AGENTS.
