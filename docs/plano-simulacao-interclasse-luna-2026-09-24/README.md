# Simulação integral do Interclasses — plano de implementação para Luna

**Estado: jornada principal implementada e gate completo aprovado; a matriz ampliada ainda tem lacunas.** O run `docker-20260925_113751_9d23b2` passou em PHP 8.4/MariaDB descartável: qualidade, integração, 173/173 testes gerais de navegador, contrato visual 2/2 e simulação integral. Na mesma edição, os 15 jogos coletivos e quatro provas foram operados pela interface; os 224 alunos autenticaram e conferiram 322 inscrições. Três jogos (duas semifinais e a final) foram concluídos offline, o ID temporário da final foi reconciliado, e respostas perdidas de ponto, resultado, ocorrência e arrecadação foram repetidas com a mesma identidade e efeito único. Um colaborador diferente também foi impedido de reutilizar a identidade de crédito (HTTP 409, histórico inalterado). Inscrições sem CSRF, com token inválido ou para equipe de outra turma foram recusadas sem alterar os 322 vínculos; a UI confirmou pausa/retomada e correção de ponto. S00–S12 passaram; 13 critérios V estão aprovados, 14 parciais e 9 não executados. Permanecem lacunas em onboarding completo pela interface, mutações negativas/concorrentes, repetibilidade em duas execuções e aderência aos dados reais da escola. Consulte [STATUS.md](STATUS.md) para resultados e limites precisos.

## Objetivo

Implementar uma competição sintética completa, da criação da edição à consulta dos resultados depois da premiação. Todos os alunos devem realizar sua jornada de acesso e inscrição, todas as modalidades devem acontecer, todos os confrontos devem ser operados e o resultado final deve ser conferido contra um livro de eventos independente. A simulação deve incluir administração, colaboração, mesários, alunos, calendário, revisão de inscrições, arrecadação, disciplina, falhas de rede e encerramento.

O cenário principal usa **todas as 7 turmas padrão, com 32 alunos cada: 224 alunos**, 2 categorias, 10 modalidades, 35 pares lógicos turma/modalidade e **322 inscrições válidas**. As 14 vagas individuais precisam de 14 equipes operacionais de um atleta, além das 35 equipes padrão: 49 linhas operacionais. O último gate concluiu **15 jogos coletivos e 4 provas individuais**, reconciliou 313 pontos esportivos ativos e um anulado, 427 pontos de arrecadação e 35 de penalidades. A interface operou todos os 15 jogos e os quatro pódios; os 224 alunos autenticaram no portal e conferiram suas 322 inscrições.

Essa é uma premissa baseada no cadastro padrão do código, não uma confirmação do cadastro da escola. A lista real de salas, modalidades, locais, horários e regulamento não foi fornecida. O cenário deve aceitar um manifesto explícito com outras salas, mantendo 32 alunos por sala; nunca excluir silenciosamente salas adicionais. A aprovação do cenário padrão não comprova aderência a um regulamento escolar ainda não informado.

## Pacote

| Documento | Uso |
| --- | --- |
| [00-inventario.md](00-inventario.md) | Contratos atuais, testes existentes e lacunas |
| [01-cenario-e-oraculo.md](01-cenario-e-oraculo.md) | População exata, inscrições, agenda, eventos e resultados esperados |
| [02-jornada-completa.md](02-jornada-completa.md) | Roteiro contínuo S00–S12 da competição |
| [03-arquitetura-e-etapas.md](03-arquitetura-e-etapas.md) | Organização dos testes e etapas E00–E09 para implementação |
| [04-validacao-e-evidencias.md](04-validacao-e-evidencias.md) | Matriz de aceite, execução, evidências e limites |
| [STATUS.md](STATUS.md) | Progresso e pendências reais |
| [PROMPT-LUNA.md](PROMPT-LUNA.md) | Prompt pronto para implementação futura |

## O que caracteriza uma simulação completa

- Uma mesma edição permanece íntegra durante preparação, inscrições, revisão, competição, reconciliação e encerramento; não há reset entre suas etapas.
- Os 224 alunos participam; não basta cadastrar nomes e operar um torneio de quatro equipes.
- O caminho principal usa servidor, banco, sessões e regras reais. O runner mantém uma edição e um banco descartável entre preparação HTTP, operação visual dos mesários e provas, reconciliação e publicação.
- A spec visual opera os 15 jogos reais pela interface, incluindo chave offline com fila IndexedDB real e dois mesários simultâneos; a jornada confirma os atletas/pontos e espera a sincronização do servidor antes da reconciliação.
- O livro de eventos fornece o esperado antes de cada ação. O ranking retornado pela aplicação não pode gerar o próprio resultado esperado.
- Casos negativos e de concorrência usam ramificações isoladas, sem impedir que o roteiro principal chegue ao fim. Falhas reais continuam reprovando a entrega.

Não se trata de um seed de demonstração, teste de carga em produção ou garantia absoluta de ausência de falhas. O objetivo é uma simulação funcional ampla, verificável e reproduzível. Os resultados e limites realmente cobertos ficam registrados em [STATUS.md](STATUS.md).

## Ordem e precedência

Ler o pacote inteiro e o [AGENTS.md](../../AGENTS.md), conferir o checkout atual e implementar E00–E09 na ordem. Rotas, migrações, serviços e testes atuais prevalecem sobre exemplos históricos. Defeitos descobertos devem receber regressões e correções coerentes; não enfraquecer invariantes para terminar a simulação. Regras esportivas inexistentes devem aparecer como lacunas de produto, com impacto e decisão pendente.

A simulação deve ser descoberta pelos executores oficiais e integrar o gate completo. Não entregar apenas um script que precisa ser lembrado manualmente ou um relatório de ações sem asserções.
