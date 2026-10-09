# Contratos técnicos e mapa do código

## 1. Pontos de partida conferidos

Caminhos relativos à raiz do repositório; localizar símbolos, não depender de números de linha.

| Código existente | Contrato observado / mudança necessária |
| --- | --- |
| `src/Modules/Competicoes/Application/ModalidadeService.php` | Normaliza a quantidade planejada de equipes, limites do elenco e formato da modalidade. |
| `resources/views/pages/eventos/configurar-modalidades.php` e `resources/js/pages/eventos/configurar-modalidades.js` | Cadastro já possui máximo de equipes por turma; distinguir quantidade exata. |
| `src/Modules/Competicoes/Application/EquipeService.php` e `Domain/EquipeRosterRules.php` no mesmo módulo | Incluir validação de agenda nas mutações de elenco. |
| `src/Modules/Competicoes/Infrastructure/MysqliEquipePadraoRepository.php` | Equipe padrão e redistribuição; não usar como destino implícito do novo fluxo. |
| `src/Modules/Participantes/Infrastructure/MysqliInscricaoRepository.php` | Hoje usa capacidade agregada, cria/busca equipe padrão e pode confirmar parcialmente; novo fluxo exige destino exato e atomicidade. |
| `src/Modules/Participantes/Application/InscricaoService.php` | Entrada atual `id_interclasse`, `id_equipes`; manter identificação de aluno na sessão, nunca no payload. |
| `src/Modules/Competicoes/Infrastructure/MysqliChaveamentoManagement.php` | `createBracket()` exige elenco e processa BYEs; separar planejamento de operação. |
| `src/Modules/Competicoes/Infrastructure/MysqliChaveamentoRepository.php` | Revisar tags, geração, classificação, avanço e integração com reservas antes de alterar estrutura. |
| `src/Modules/Competicoes/Application/AgendamentoBlocoScheduler.php` e `AgendamentoSequencialScheduler.php` | Reusar simulação; verificar dependências, durações e recursos por modalidade no lote completo. |
| `src/Modules/Competicoes/Infrastructure/MysqliAgendamentoBlocoRepository.php` | Reservas futuras e revisão existem; `participants()` usa equipes, não alunos; revisão atual baseada em blocos não cobre todas as mutações. |
| `src/Modules/Competicoes/Infrastructure/MysqliIndividualRepository.php` e `MysqliIndividualRankingRepository.php` | Integrar vagas individuais ao participante real sem alterar resultado/pódio por nome de modalidade. |
| `src/Modules/Participantes/Infrastructure/MysqliPortalAlunoRepository.php` e `resources/js/pages/aluno/modalidade.js` | Expor equipes escolhíveis, capacidade própria e compromissos. |
| `config/routes.php`, `config/routes/web.php` | Composição e contratos HTTP; conferir também todos os escritores administrativos de equipes/jogos. |

Referências conceituais históricas: [agendamento em blocos](../plano-agendamento-em-blocos.md) e [chaveamento/agenda](../plano-ajuste-chaveamento-agenda.md). Não copiar comandos, permissões ou contratos antigos sem conferir o código.

## 2. Fronteiras propostas

Nomes abaixo são propostas de classes novas, não arquivos já presentes. Verificar equivalentes antes de criar.

- `Competicoes/Domain`: regras puras de configuração, projeção de compromissos e conflito; contratos de repositório de planejamento e consulta da agenda por entrada.
- `Competicoes/Application`: preparação de entradas, planejamento de chaveamento, simulação geral, publicação e relatório de impacto. Coordenação transacional por `TransactionRunner`.
- `Participantes/Application`: inscrição/transferência, combinando elegibilidade existente com contrato público de disponibilidade de `Competicoes`.
- `Eventos`: calendário e configuração da edição, sem importar infraestrutura concreta de outro módulo.
- `Infrastructure`: SQL, locks, histórico e implementação dos contratos. `Presentation/Http`: autenticação, autorização, normalização de transporte e respostas.

Extrair apenas as responsabilidades necessárias dos repositórios atuais. Não ampliar acoplamentos existentes nem abrir refatoração geral de módulos.

## 3. Persistência e invariantes

Definir o DDL final em T01 e registrar no STATUS. Modelo lógico obrigatório:

| Informação | Estratégia proposta |
| --- | --- |
| Estado da edição | Toda edição usa cronograma planejado; o cliente não escolhe o fluxo pela inscrição. |
| Configuração da modalidade | Quantidade planejada, formato de participação, mínimo de elenco, duração, descanso e turmas/locais habilitados. Reusar máximo existente. |
| Entrada planejada | Preferir equipe existente como identidade inclusive para dupla/individual; ordinal estável por modalidade/turma, único quando preenchido. Não usar nome como chave. |
| Preparação da entrada | Marcador separado de status ativo e de aptidão do elenco. Entrada individual só se torna atleta após vínculo real. |
| Estado da agenda | Revisão monotônica da edição, versão publicada, estado e janela de inscrição; atualização transacional. |
| Estrutura futura | Nós/dependências e entradas candidatas por versão da chave; não depender de texto livre de nome do jogo. |
| Agenda de trabalho | Reusar `agenda_blocos`, `agenda_reservas` e histórico, estendendo apenas quando necessário. |
| Publicação | Snapshot imutável dos compromissos e referência de versão; rascunho não altera a consulta do aluno. |

Não criar novos estados no ENUM de jogo para representar rascunho sem revisar todos os consumidores. Preferir manter nós planejados separados dos jogos operacionais e materializar/vincular jogos com IDs estáveis quando apropriado. A publicação já permite consultar compromissos sem exigir IDs de jogos futuros. O início efetivo exige elenco apto e estado operacional liberado; o snapshot offline precisa receber essa liberação.

A vinculação de um nó futuro a jogo real precisa ser idempotente e usar edição, modalidade, versão e tag, preservando a resolução existente de IDs temporários. Não recriar uma final que já foi materializada pelo avanço.

Adicionar migration futura numerada conforme a convenção atual e atualizar o schema inicial conforme README/deployment. As duas vias devem convergir e uma instalação nova seguida de `migrate` não pode falhar com coluna/tabela duplicada. Não editar migration aplicada, apagar marcador de falha ou copiar números históricos. Testar também upgrade a partir do baseline anterior.

As equipes planejadas recebem ordinais persistentes e não são inferidas apenas pelo nome. A configuração precisa existir antes da publicação; nunca migrar dados de trabalho para demonstrar a funcionalidade.

## 4. HTTP proposto

Rotas atuais conferidas: `/api/v1/modalidades`, `/api/v1/equipes`, `/api/v1/equipes/gerar`, `/api/v1/chaveamentos`, `/api/v1/agenda-blocos`, `/api/v1/inscricoes`. Reaproveitar quando a semântica comportar; endpoints abaixo são propostas a implementar, não contratos já disponíveis.

| Operação | Contrato proposto |
| --- | --- |
| Preparar | Estender geração de equipes com modo planejado, revisão esperada e chave idempotente; retornar criadas/existentes/pendências. |
| Simular agenda da edição | Ação explícita em agenda; todas as modalidades participantes, janelas e parâmetros; retornar proposta, pendências e revisão de origem. Sem escrita. |
| Confirmar rascunho | Revalidar proposta no servidor; nunca confiar no array de conflitos enviado pelo cliente. |
| Publicar/revisar/abrir/encerrar | `/api/v1/cronograma` com ações explícitas, edição e revisão esperada; separar confirmação de blocos de publicação geral. |
| Consultar opções | Leitura autorizada do portal com equipe, vagas, compromissos e versão publicada; sem dados privados de outras turmas. |
| Inscrever | Manter POST `/api/v1/inscricoes`; acrescentar `versao_cronograma` obrigatória para edição planejada. `id_equipes` identifica destinos exatos. |
| Transferir | Caso de uso administrativo específico, ou evolução explícita do contrato atual, com origem/destino, aluno, revisão e atomicidade. |

Para o fluxo: 422 para configuração inválida; 409 para versão obsoleta, lotação concorrente, agenda incompatível ou estado de inscrição fechado; autorização/CSRF seguem contratos centrais. Resposta de domínio usa `success`, `message`, `code` e detalhes seguros, por exemplo `CONFLITO_AGENDA`, `CRONOGRAMA_DESATUALIZADO`, `INSCRICOES_FECHADAS` e `EQUIPE_LOTADA`.

Sucesso de inscrição pode preservar `insercoes`, `ja_existentes`, `erros`, acrescentando versão e IDs confirmados. Duplicata exata não ocupa nova vaga; outra equipe da mesma modalidade exige transferência. Conflito faz rollback do conjunto. Erro nunca retorna `success=true`.

Administrador gerencia configuração, publicação e janela. Colaborador mantém operações já autorizadas de agenda/elenco, sem herdar automaticamente administração da edição. Mesário não publica, não abre inscrições e não prepara equipes; opera jogos liberados da edição ativa. Aluno consulta publicação elegível e altera somente suas inscrições pelo fluxo autorizado. Testar acesso direto e vínculo de cada recurso, além do perfil.

## 5. Concorrência

Inicialmente preferir a trava da edição como coordenação comum entre inscrição, revisão, publicação, preparação e alterações de elenco no modo planejado. Todas as rotas escritoras relevantes precisam participar: uma trava usada só na inscrição não protege contra alteração administrativa.

Dentro da transação, reconsultar versão/estado, aluno, inscrições e capacidades; aplicar ordem consistente de locks (edição antes dos recursos, IDs ordenados), compatível com as travas de locais existentes. Fazer inventário da ordem atual antes de introduzir locks para evitar deadlocks. Não manter transação aberta durante simulação longa no navegador.

Após adquirir locks, recalcular a decisão com dados atuais; checagem otimista antes da transação não basta. Confirmar vínculos e estado na mesma transação. Falha após primeira inserção, transferência ou materialização deve desfazer todas as alterações relacionadas.

Identidade única de preparação e de nós impede duplicação por clique/reenvio. A revisão deve mudar também para alterações de horário feitas fora do agendamento em blocos. Snapshot publicado não é obtido por `MAX(revisao)` dos blocos.

## 6. Frontend e offline

Estender fontes existentes de modalidades, configuração de equipes, agenda, elenco e portal; confirmar nomes atuais antes de editar. Primeiro inventariar tokens/componentes em [estilos](../frontend-styles.md). Reusar CSS compartilhado, sem novos arquivos CSS ou estilos inline; usar foco, mensagens associadas a campos e estados distinguíveis sem depender apenas de cor.

Usar `page-runtime.js`, `Assets` e `Url`; validar raiz e subdiretório, reentrada e ausência de listeners duplicados. Exibir horários condicionais como tais. O erro de versão mantém as escolhas visíveis e solicita atualização explícita, sem confirmar outra opção automaticamente.

Planejamento, publicação e inscrições são operações online. Revisar a interceptação global para que as novas operações não entrem inadvertidamente na fila offline. Não desabilitar transporte de resultados do mesário. Manter IDs, tags, chaves de mutação e confirmação atômica. Atualizações de cache devem falhar de forma recuperável, sem descartar IndexedDB ou alterar payload já enfileirado.
