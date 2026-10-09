# Prompt para o modelo Luna

Copie o texto abaixo para uma tarefa configurada com **Luna**. Este arquivo não cria uma tarefa nem executa o modelo automaticamente.

---

Crie o manual completo de uso do SGI seguindo `docs/plano-manual-usuario-luna-2026-09-24/README.md`. Leia também `00-inventario.md`, `01-estrutura-e-padrao.md`, `02-etapas.md`, `03-validacao.md`, `STATUS.md`, o `AGENTS.md` atual, `README.md`, `docs/architecture.md` e `docs/testing.md`. Use o código e a interface da revisão atual como fonte de verdade; os requisitos e planos antigos são apenas pistas.

Execute M00–M09 na ordem. Comece conferindo `HEAD`, status da árvore e mudanças alheias. Complete a matriz de todas as telas/tarefas do inventário, com perfil, pré-requisitos, caminho pela UI, estados, permissão real no servidor, resultado, erro e recuperação. Não transforme uma rota ou botão isolado em instrução sem seguir a jornada. Confirme especialmente login único, primeiro acesso do aluno, termos, preparação/publicação do cronograma antes das inscrições, revisão antes da liberação, mínimos de elenco, liberação e operação dos jogos pela árvore publicada, ranking por edição e operação offline do mesário na mesma aba preparada.

Produza `docs/manual-usuario/README.md` e os capítulos definidos em `01-estrutura-e-padrao.md`, com índice por tarefa e por perfil, procedimentos numerados, pré-requisitos, resultado esperado, solução de erro e próximos passos. Use português simples e rótulos atuais da interface. Cubra administrador, colaborador, mesário e aluno, inclusive os limites de acesso e as variantes de modalidade que realmente aparecerem. Inclua imagens locais somente quando ajudarem, com dados fictícios, legenda e texto alternativo. Não documente recursos históricos ou hipotéticos como se estivessem disponíveis; marque lacunas verificadas no STATUS.

Observe as jornadas J01–J06 em ambiente isolado com dados sintéticos conforme AGENTS; não use banco de trabalho, credenciais reais ou dados pessoais. Para offline, prepare online, teste na mesma aba e não limpe IndexedDB/fila. Não altere o comportamento do sistema para conformá-lo ao texto. Registre defeitos do produto separadamente com reprodução e impacto. Se o ambiente impedir observação, conclua a inspeção documental possível, marque os aceites sem evidência como parciais e não declare o manual homologado.

Ao final, aplique V01–V18, confira links/âncoras/imagens e `git diff --check`. Para documentação pura, não é necessário executar a suíte de aplicação; se modificar código, siga os testes completos do AGENTS. Atualize `STATUS.md` após cada etapa com versão, data/fuso, ambiente, arquivos, verificação real, falhas, limites e próxima ação. Preserve mudanças preexistentes; não faça push, deploy ou publicação sem pedido. Entregue link para o índice do manual, cobertura por perfil e limitações concretas.
