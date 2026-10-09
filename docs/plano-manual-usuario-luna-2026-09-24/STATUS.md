# Estado de execução do manual

**Atualizado:** 24/09/2026, America/Sao_Paulo  
**HEAD de referência:** `b31afce8d02b8042cee0f5b578b78f29ea8cf5d7`  
**Manual fonte:** `../manual-usuario/README.md` e capítulos adjacentes.  
**PDF:** `../../output/pdf/manual-usuario-sgi.pdf`.

## Etapas

| Etapa | Estado | Evidência/arquivos | Limite ou próxima ação |
| --- | --- | --- | --- |
| M00 — Baseline | Concluída | HEAD conferido; alterações preexistentes do checkout preservadas. | Nenhuma. |
| M01 — Inventário | Parcial | Rotas web, views/JS relevantes, README e instruções revisados; ver matriz V01–V18 em `../manual-usuario/STATUS.md`. | Perfis e contratos não foram todos navegados. |
| M02 — Jornadas reais | Parcial | Projeto Docker descartável; edição sintética criada por UI; preparação, geração, publicação e abertura da agenda percorridas. Capturas em `../manual-usuario/imagens/`. | Sem aluno, liberação, jogo ou sincronização offline reais. |
| M03 — Índice e acesso | Concluída como texto; fluxo parcial | Índice, glossário e capítulo de acesso produzidos. | Primeiro acesso do aluno não foi percorrido. |
| M04 — Administração | Concluída como texto; fluxo parcial | Capítulo administrativo e capturas de edição, painel, configurações, modalidades/equipes e perfil. | Cadastro de aluno e colaborador não foi salvo. |
| M05 — Agenda/inscrições | Concluída como texto; fluxo parcial | Capítulo cobre preparação, rascunho, revisão, publicação, janela, mínimos e liberação; geração/publicação/abertura vistas na UI. | Revisão, encerramento, mínimo e liberação não foram navegados. |
| M06 — Mesário/offline | Concluída como texto baseado em contratos | Capítulo cotejado com placar, scripts offline, chaveamento e regras do repositório. | Operação e reconexão não exercitadas. |
| M07 — Aluno/resultados/erros | Concluída como texto baseado em contratos | Capítulos de aluno, consultas e suporte produzidos. | Inscrição, variantes de ranking publicado e recuperação não exercitadas. |
| M08 — Revisão | Parcial | 23 imagens sintéticas registradas; capítulos, alt text, links e PDF em revisão. | Sem leitor independente, teste de tela móvel de aluno ou leitor de tela. |
| M09 — Entrega | Concluída | PDF de 29 páginas, 23 capturas e fonte Markdown gerados; links/imagens conferidos, páginas rasterizadas/inspecionadas, Compose descartável encerrado e intermediários de PDF removidos. | Manter limitações em `../manual-usuario/STATUS.md`. |

## Ambiente usado

- Aplicação isolada em `http://127.0.0.1:8099/`.
- Compose project: `sgi-manual-20260924`; base: `sgi_test_manual20260924`.
- Edição: “Interclasses Demonstração”, criada pela interface; usuário administrativo também sintético.
- Uma semente SQL histórica foi tentada exclusivamente na base descartável e recusada por enum incompatível com o schema atual; não foi usada. A criação de edição e os dados necessários às capturas foram feitos pelo fluxo suportado.
- A limpeza final pode remover somente o projeto nomeado acima e seus volumes descartáveis.

## Achado relevante

Modalidades ativas precisam de quantidade de equipes/entradas planejadas antes de gerar o rascunho quando a edição agenda antes das inscrições. A tela de nova modalidade mostra o campo; o formulário observado ao editar modalidade preexistente não o mostrou. O manual sinaliza a validação e orienta revisar os cadastros, sem sugerir exclusão de modalidade/equipe com dados.

## Matriz V01–V18

Ver a matriz atualizada em `../manual-usuario/STATUS.md`. Estados parciais decorrem de fluxos sem execução por perfil ou sem efeito persistido observado; não representam aprovação ponta a ponta.

## Fechamento

O PDF foi validado estruturalmente e rasterizado; 29 páginas foram inspecionadas em folhas de contato. Destinos Markdown/imagens não têm erros e `git diff --check` não apontou whitespace inválido. O extrator pypdf substitui parte dos acentos WinAnsi; a rasterização visual está correta. O Compose descartável deste trabalho foi encerrado.
