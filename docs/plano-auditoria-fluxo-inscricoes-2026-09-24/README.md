# Rascunho, publicação, inscrições e calendário — plano de correção

**Estado: auditoria estática concluída; implementação iniciada; testes automatizados não executados.**

Referência da auditoria: 24/09/2026, America/Sao_Paulo; HEAD `b31afce8d02b8042cee0f5b578b78f29ea8cf5d7`, com alterações preexistentes no checkout. A implementação foi autorizada em solicitação posterior. Nenhum teste automatizado, acesso ao banco, reset, seed, publicação ou deploy foi realizado nesta etapa.

## Conclusão

Há defeitos no código atual; o relato não deve ser atribuído apenas à maneira como os alunos testaram. O principal candidato à falha na segunda publicação é a validação que considera a presença do mesmo aluno em duas equipes um conflito **mesmo quando os compromissos têm horários ou datas diferentes**. Isso pode aparecer somente depois da primeira rodada de inscrições.

Também há divergências entre o calendário e o planejamento, entre os botões e os estados aceitos pelo servidor, e uma alteração de planejamento de modalidade que consegue retirar a liberação da competição. O acesso do aluno à inscrição existe no menu, mas falta uma chamada direta no conteúdo do perfil e o início utiliza o rótulo genérico “Ver Detalhes”.

**Não foi identificada a causa exata do incidente dos alunos.** Não foram fornecidos URL, mensagem, horário, versão servida nem sequência precisa. Os achados abaixo são demonstráveis pela leitura do checkout, mas não foram reproduzidos nesta rodada em navegador/HTTP. Não confundir inspeção estática com homologação aprovada.

## O que pode ser repetido

- Na mesma edição, **antes de liberar a competição**, é permitido publicar → abrir inscrições → encerrar/revisar → gerar → republicar → reabrir inscrições. As inscrições existentes precisam ser preservadas e revalidadas pelos horários reais.
- **Depois de liberar a competição**, o fluxo atual impede substituir a árvore. Criar outra edição é o caminho para começar um evento independente. Uma futura necessidade de reprogramar competição em andamento exige contrato próprio; este plano não propõe remover a proteção.
- Publicar o cronograma, abrir inscrições e liberar a competição são três ações diferentes. A interface deve explicar cada uma e seu próximo passo.

## Leitura e execução

1. [Diagnóstico com evidências e cenários](00-diagnostico.md).
2. [Contrato esperado](01-contrato.md).
3. [Etapas de implementação](02-etapas.md).
4. [Matriz de validação futura](03-validacao.md).
5. [Status e limites desta auditoria](STATUS.md).
6. [Prompt para continuidade](PROMPT-LUNA.md).

O pacote complementa o [plano anterior do segundo ciclo](../plano-segundo-ciclo-cronograma-luna-2026-09-23/README.md). As correções já presentes de reativação dos botões, exclusão da própria publicação suspensa na geração e tratamento de pendências devem ser preservadas. O status aprovado daquele plano não comprova os cenários novos deste documento.

O usuário autorizou iniciar a implementação deste plano e manteve a restrição de não executar testes automatizados agora. A implementação e os cenários de regressão seguem em andamento; a matriz de validação só será executada quando o usuário retirar essa restrição.
