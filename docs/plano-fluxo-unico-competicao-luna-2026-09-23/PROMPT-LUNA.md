# Prompt para implementar ou retomar com Luna

Copiar o texto abaixo em uma tarefa configurada com Luna. Este documento não inicia outro modelo nem cria tarefa automaticamente.

---

Implemente o roteiro `docs/plano-fluxo-unico-competicao-luna-2026-09-23/README.md` no SGI. Leia o AGENTS.md atual, README do projeto, arquitetura, testes e todos os documentos do pacote: inventário, contratos, etapas, validação e STATUS. Consulte os planos anteriores apenas como contexto; seus registros de aprovação não aprovam este ajuste.

O objetivo é um único fluxo: preparar equipes vazias → gerar/publicar calendário e árvore → abrir inscrições → alunos consultam horários e escolhem → encerrar inscrições/resolver mínimos → liberar competição, criando jogos a partir da publicação → resultados avançam pela mesma árvore, online e offline. A tela Chaveamento continua, mas a geração inicial independente deve desaparecer da UI e ser impedida na API, preservando consultas e resultados individuais legítimos.

Execute U00–U09 sequencialmente. A referência documental é `eaef642d37c4f0f182cc090793947a1aab986921`, com arquivos preexistentes modificados e atividade de outra tarefa; confira o checkout atual e preserve trabalho alheio. Não assuma nomes/linhas/schema dos documentos sem consultar código. Se uma etapa já estiver resolvida, demonstre seu aceite e registre a evidência.

Não basta retirar um botão, mudar um parser ou criar jogos na liberação. Feche identidade persistente, unicidade/concorrência, continuidade em revisões, transação integral da liberação, agenda original das fases futuras, BYEs, vencedor/desempate, final terminal, classificação/pontuação, provas individuais, projeção offline e reconciliação de IDs temporários. Uma falha não pode deixar liberação ou resultado parcial. O motor online e sua projeção offline consomem a mesma árvore; não criam outro torneio.

Siga as fronteiras de Domain/Application/Infrastructure e use TransactionRunner para coordenação. Novas migrações somente quando necessárias, sem alterar aplicadas. Preserve regras de pontos, sessão/auth_version, CSRF, autorização/edição, capacidade, inscrição e idempotência. Não resete base de trabalho, altere .env, apague IndexedDB/fila ou remova formatos persistidos ainda exigidos pelas instruções atuais.

Antes de editar, registre baseline. Refatorações exigem suíte completa antes/depois; cada defeito precisa de regressão que falhe pelo motivo esperado antes da correção quando viável sem desfazer trabalho do usuário. Jornada principal usa APIs reais, começa com zero vínculos nas equipes e termina com resultado final, incluindo variante offline na mesma aba preparada. Mapeie V01–V20 para testes descobertos pelos runners; não relaxe asserções, use skips ou atualize snapshots sem inspecionar.

SQL/HTTP/navegador somente nos executores oficiais com containers descartáveis. Execute bateria completa com visual e motores SQL pertinentes conforme AGENTS vigente. Confirme comandos em `03-validacao.md`. Se houver impedimento, registre erro exato, conclua trabalho independente seguro e não declare aprovação sem execução. Não faça push, merge ou deploy automaticamente.

Atualize STATUS após cada etapa com decisões, arquivos, falha antes, comandos/exit codes, data/fuso, revisão/ambiente, logs e cobertura da matriz, limitações e próxima ação. Faça commits coerentes apenas das alterações próprias prontas e validadas conforme AGENTS. Ao retomar, releia STATUS e continue na primeira etapa incompleta. Ao entregar, explique o que mudou e foi realmente validado, distinguindo testes locais de CI remoto.
