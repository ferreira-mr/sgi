# Prompt de implementação e retomada para Luna

Copie o texto abaixo na tarefa de implementação com Luna. Não é necessário recuperar a conversa desta auditoria. A criação deste documento não inicia outro modelo.

---

Implemente integralmente o roteiro `docs/plano-correcao-cronograma-luna-2026-09-22/README.md` no SGI. Leia o AGENTS.md atual, README do projeto, inventário, contratos, etapas, validação e STATUS do pacote. Consulte `docs/auditoria-cronograma-inscricoes-2026-09-22.md` para as evidências dos defeitos.

A referência é `c88a5b0d`. Confira o checkout e preserve alterações posteriores/preexistentes. Execute C00–C12 sequencialmente e retome a primeira etapa incompleta. Este pacote corrige a implementação anterior; o STATUS “validado” de 21/09 não é prova dos novos aceites. Se algo já estiver corrigido, demonstre os critérios e registre o teste antes de avançar.

O sistema está em desenvolvimento e não exige compatibilidade com versões anteriores do software. Adote um contrato único e atualize servidor, frontend, offline, fixtures e testes juntos. Não implemente aliases, fallbacks, conversores de publicações nem leitores/migradores de filas antigas. Isso não elimina revisão de cronograma, atomicidade, idempotência ou preservação de resultados e filas criados durante operação normal do contrato final. Não redefina a base de trabalho nem limpe o navegador do usuário.

Corrija árvore entre turmas da mesma categoria, identidade de nós e BYEs, publicação completa/revalidada, janela e revisão da inscrição, lote atômico, conflitos na republicação e no elenco, mínimos/liberação/materialização, interface e reconexão offline. Integre o motor atual de resultado/avanço/pontuação, sem criar outro. Extraia regras compartilhadas para Domain e coordenação para Application com TransactionRunner; SQL e locks ficam em Infrastructure. Corrija também a retenção de artefatos de navegador e visual antes das homologações.

Para cada defeito, crie regressão descoberta pelas suítes atuais e demonstre falha antes da correção quando viável sem reverter mudanças do usuário. Assertar comportamento e persistência, incluindo erros, limites, autorização, rollback e concorrência. Jornada principal de navegador usa API real; mocks ficam em testes separados de falhas controladas. Não relaxe testes, acrescente skips ou atualize snapshots apenas para obter verde. Testes reduzem risco e detectam regressões conhecidas; não prometa garantia absoluta de nunca haver regressão.

Use apenas executores oficiais com banco descartável. Registre baseline antes de editar e suíte completa antes/depois de refatorações; regressão específica e bateria completa após correções funcionais conforme AGENTS. Inclua visual para layout e MariaDB 10.11 para schema/SQL. Confira matriz V01–V26, janela no servidor, duas abas, quatro perfis, raiz/subdiretório, mesma aba preparada offline e reenvio. Preserve autoria, CSRF renovado, vínculo de pontos e confirmação idempotente.

Atualize STATUS ao terminar cada etapa com decisões, arquivos, comandos/exit codes, falha antes/aprovação depois, horário/fuso, ambiente, logs e próxima ação. Se houver bloqueio, registre o erro exato e conclua trabalho independente possível; não declare validação incompleta como aprovação. Prossiga sem pedir confirmação para decisões reversíveis já cobertas pelo roteiro. Ao concluir, revise diff/stage e produza commits coerentes apenas das mudanças desta implementação. Não faça push, merge ou deploy automaticamente. Entregue resultados reais e limitações, distinguindo CI remoto de testes locais.
