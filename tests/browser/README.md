# Testes do navegador

Consulte [o guia de execução](../../docs/testing.md) para preparar banco, servidor, Chromium e variáveis de ambiente.

- `auth-rbac.spec.cjs`: autenticação, saída e permissões.
- `admin-lifecycle.spec.cjs`: criação e configuração de uma edição.
- `aluno-portal.spec.cjs`: termos, inscrições, agenda e perfil.
- `full-interclasse-portal.spec.cjs`: os 224 alunos da edição sintética entram no portal e conferem suas 322 inscrições; os eventos esportivos dessa edição são operados pelo teste HTTP integral.
- `frontend-regression.spec.cjs`: navegação, conteúdo e layout das telas de todos os perfis.
- `mesario-offline.spec.cjs`: partida offline com gol, ocorrência e sincronização.
- `mesario-responsive.spec.cjs`: composição compacta Xiaomi horizontal, desktop Full HD, alvos de toque e remontagem SPA do placar.
- `tournament-offline.spec.cjs`: sete partidas online e sete sem rede, com confirmação do campeão.
- `offline-tournament-bracket.spec.cjs`: projeções locais e árvore completa do torneio.
- `offline-queue-regression.spec.cjs`: IndexedDB real, respostas controladas, identidade, retry e isolamento da fila.
- `bootstrap-components.spec.cjs`: estados de controles nativos e diálogos Bootstrap usando somente assets estáticos.

Limitações intencionais: a operação exige que a sessão autenticada tenha
preparado a casca SPA antes da desconexão; refresh, nova aba ou abertura a frio
sem essa casca não são apresentados como suporte garantido. O projeto não usa
Service Worker. Uma pausa recebida no formato antigo, sem o snapshot de
cronômetro v2, continua aceita usando `tempo_restante_jogo`/`duracao_jogo`, mas
não pode recuperar a referência temporal exata que só existe no formato v2.
- `visual-contract.spec.cjs`: comparação das imagens de login usando referências específicas para Windows e Linux.

O Playwright divide a seleção em dois projetos: `database` executa em série com um worker todos os cenários que podem consultar ou alterar dados; `independent` aceita somente `bootstrap-components.spec.cjs` e `offline-queue-regression.spec.cjs`, com um worker e diretório de artefatos separado. Os dois projetos continuam incluídos na execução completa. Não rode dois processos Playwright sobre a mesma base ou pasta de resultados. As preparações por API usam o token CSRF real da sessão.

O projeto `simulation` é selecionado apenas pelo serviço `browser-simulation` do runner Docker após a preparação da edição de 224 alunos. Ele também executa em série, separado dos fixtures compartilhados. Essa spec confirma autenticação e privacidade das inscrições; não opera os confrontos da edição principal nem representa a fase offline S08 integrada.
