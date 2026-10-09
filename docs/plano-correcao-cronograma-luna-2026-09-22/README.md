# Correções do cronograma e inscrições — roteiro para Luna

**Estado: planejado, implementação não iniciada.** Preparado em 22/09/2026 sobre `c88a5b0d3db995563ca996c46d7c0298248de057`. Origem: [auditoria de cronograma e inscrições](../auditoria-cronograma-inscricoes-2026-09-22.md).

## Resultado esperado

Entregar o fluxo completo: preparar entradas por turma, disputar entre turmas da mesma categoria, gerar todos os compromissos, publicar uma agenda íntegra, abrir inscrições na equipe escolhida e no período correto, encerrar, liberar jogos com elencos aptos e avançar a competição online/offline sem duplicidade. Revisões de agenda devem considerar alunos inscritos e impedir uso de uma proposta obsoleta.

Este pacote complementa e corrige a entrega de [21/09](../plano-cronograma-inscricoes-luna-2026-09-21/README.md). O status “validada” daquele pacote não comprova os aceites desta correção. A auditoria é evidência do ponto de partida; seu conteúdo precisa ser conferido com o checkout encontrado no início da execução.

## Premissas confirmadas

- **Sem compatibilidade com versões anteriores do software.** Atualizar servidor, frontend, offline, fixtures e testes juntos. Não implementar aliases, adaptadores, leitura dupla, migração de filas antigas ou conversores de publicações de versões anteriores. Testar instalação limpa e contrato final.
- Revisão do cronograma é uma informação do evento, necessária para concorrência e atualização de agenda na versão atual do software. Continuar preservando histórico, inscrições, resultados e filas produzidos durante o uso normal desse contrato.
- Equipes têm origem em turmas; o torneio pertence à modalidade/categoria. Não montar um torneio isolado para cada turma. Não há confrontos entre categorias. Cabo de guerra permanece fora do cenário do evento.
- SQL e testes destrutivos somente em containers descartáveis dos executores oficiais. A dispensa de compatibilidade não autoriza reset da base de trabalho, alteração de `.env` ou limpeza do navegador pessoal.
- Não existe teste capaz de garantir que uma regressão nunca ocorrerá. A entrega exige cobertura dos comportamentos de risco, regressões que detectem os defeitos conhecidos e execução efetiva das suítes, sem prometer garantia absoluta.

## Leitura e execução

1. Ler [AGENTS.md](../../AGENTS.md), [README](../../README.md), [arquitetura](../architecture.md), [testes](../testing.md) e [implantação](../deployment.md).
2. Conferir [inventário](00-inventario.md), [contratos finais](01-contratos.md) e [STATUS](STATUS.md).
3. Executar [C00–C12](02-etapas.md) sequencialmente, respeitando dependências e a [matriz de validação](03-validacao.md).
4. Atualizar STATUS após cada etapa, com falha antes da correção, resultado depois, comandos, logs e próxima ação.
5. Para iniciar ou retomar em Luna, usar [PROMPT-LUNA.md](PROMPT-LUNA.md). Este pacote não inicia outro modelo nem cria tarefa no aplicativo.

Os caminhos citados como existentes foram conferidos na elaboração. Nomes de novas políticas/casos de uso são propostas, não arquivos existentes. Localizar métodos pelo nome; linhas da auditoria podem mudar. Se o defeito já tiver sido corrigido, demonstrar o aceite e registrar a evidência antes de avançar.

## Entregas e dependências

| Etapa | Entrega | Dependência | Achados |
| --- | --- | --- | --- |
| C00 | Baseline e mapa de escritores/consumidores/locks | — | Todos |
| C01 | Evidências de navegador e visual preservadas por perfil | C00 | Infraestrutura de testes |
| C02 | Identidade, estado e persistência do contrato final | C01 | A01, A02, A08 |
| C03 | Árvore entre turmas, formatos independentes e BYEs | C02 | A01, A02 |
| C04 | Agenda, projeção e disponibilidade compartilhadas | C03 | A03, A06 |
| C05 | Publicação integral, revisão e revalidação concorrente | C04 | A03, A06, A08 |
| C06 | Inscrição versionada, temporal e indivisível | C05 | A04, A05 |
| C07 | Elenco e demais escritores sem caminhos que burlem regras | C06 | A04, A06, A08 |
| C08 | Liberação, materialização e avanço canônico | C07 | A02, A07 |
| C09 | Painel e portal executáveis e recuperáveis | C08 | A04, A05, A07, A08 |
| C10 | Revisão durante operação offline e reconexão | C09 | A08 e operação |
| C11 | Jornada real e cobertura adversarial integrada | C10 | Todos |
| C12 | Baterias finais, documentação e entrega | C11 | Todos |

## Limites e entrega

Não introduzir framework, ORM, módulo genérico, segundo motor de resultados, dependências gerais, inscrição offline, otimização matemática global ou regra nova de pódio. Empates e resultados individuais seguem contratos existentes. Datas reais do evento não são pré-requisito: usar dados sintéticos nos testes.

A execução é local. Não fazer push, merge ou deploy automaticamente. Fazer commits coerentes quando as alterações estiverem prontas e validadas, conforme AGENTS, sem incluir mudanças preexistentes do usuário. CI remoto fica registrado como “não executado” até existir evidência remota; um comando local não comprova CI.

Este pedido de criação do plano é documental. A implementação funcional começa quando este roteiro for executado por Luna; nenhuma etapa está concluída apenas porque foi descrita aqui.
