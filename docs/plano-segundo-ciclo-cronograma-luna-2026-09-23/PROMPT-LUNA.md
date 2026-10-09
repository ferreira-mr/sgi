# Prompt para implementação

Implemente o plano em `docs/plano-segundo-ciclo-cronograma-luna-2026-09-23/README.md`. Leia todos os arquivos do pacote e AGENTS.md antes de editar. Execute S00–S06 e atualize STATUS após cada etapa com evidências.

O sistema será implantado do zero, sem dados e sem necessidade de compatibilidade com versões anteriores. Unifique o contrato e remova os caminhos antigos desta jornada quando seus consumidores estiverem convertidos. Não crie aliases ou adaptadores. Preserve a consistência de revisões, inscrições e filas produzidas pela versão atual. Não apague a base de trabalho nem alterações preexistentes.

Corrija os defeitos diagnosticados: ações que ficam desabilitadas após sucesso; revisão que disputa horários com sua própria publicação anterior; pendências descartadas como erro HTTP 200; proposta antiga ainda publicável depois de mudar campos; recuperação após falha parcial. Retire da jornada a programação sequencial concorrente e confirme transições no servidor.

Corrija também D06: a jornada E2E atual filtra `PL:4:` como se o primeiro número fosse a fase; o trace da auditoria prova que os dois jogos existem com IDs de modalidade/turma diferentes. Use identidades dos nós publicados/fixture e mantenha a verificação dos dois confrontos corretos. O baseline desta auditoria ficou em 169 testes de navegador aprovados e 1 reprovado, não aprovação total.

Crie regressões permanentes antes das correções, incluindo janela justa e pelo menos dois ciclos completos na mesma página com APIs reais. Preserve o bloqueio de substituir árvore após liberar a competição. A primeira jornada verde não prova o segundo ciclo. Não reduza cobertura, enfraqueça asserts ou use mocks no lugar da jornada real.

Use somente os runners oficiais com banco descartável; execute o gate final MariaDB com `-IncludeVisual` e MySQL quando pertinente ao SQL alterado. Registre limitações honestamente. Não faça push, merge ou deploy. Ao retomar, confira STATUS e continue a primeira etapa incompleta, evitando refazer trabalho já demonstrado.
