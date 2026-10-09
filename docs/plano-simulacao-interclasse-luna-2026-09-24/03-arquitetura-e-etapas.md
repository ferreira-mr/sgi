# 03 — Arquitetura dos testes e execução pelo Luna

## Estrutura implementada e lacunas

| Arquivo/diretório proposto | Responsabilidade |
| --- | --- |
| `tests/fixtures/simulacao-interclasse/manifest.json` | Manifesto sintético reproduzível: população, aliases, eventos, pontuações e oráculo, sem dados pessoais |
| `tests/Support/Simulation/` | Validação do manifesto e cálculo independente de resultados |
| `tests/Integration/FullInterclasseSimulationTest.php` | Jornada HTTP integral descoberta por `tests/run_all.php` |
| `tests/Unit/Simulation/` | Casos pequenos para validar manifesto e oráculo pelo PHPUnit |
| `tests/browser/full-interclasse-events.spec.cjs` | Dois mesários simultâneos; 15 jogos pela UI, chave completa offline, replay de ponto/resultado e quatro pódios |
| `tests/browser/full-interclasse-portal.spec.cjs` | Login e conferência de inscrições de todos os 224 alunos no projeto isolado `simulation` |
| `test-results/<execução>/simulacao-interclasse/` | Manifesto resolvido sanitizado, esperado/observado, eventos, checkpoints, cobertura e relatório |

Nomes podem ser ajustados ao padrão do repositório, mas cada responsabilidade deve permanecer identificável. Não criar endpoints de teste em produção. A infraestrutura de testes pode consultar SQL para auditoria final após validar isolamento; transições funcionais do principal passam por HTTP/UI. SQL direto fica restrito ao bootstrap mínimo de teste já existente e aos cenários controlados que precisem de estado irrepresentável, nunca à simulação de inscrições/resultados.

## Uma edição em fases contínuas

O runner executa `prepare → browser-simulation-events → finalize → browser-simulation` mantendo o mesmo banco descartável e a mesma edição em todos os estágios. `prepare` cadastra e inscreve os 224 alunos, publica/revisa agenda e guarda IDs sintéticos. A spec de eventos opera os 15 jogos pela UI; dois mesários trabalham em paralelo, três jogos formam a chave offline completa e quatro pódios individuais são registrados pela interface. A spec injeta perda de resposta após commit para ponto, resultado e ocorrência; a arrecadação também perde a resposta na UI, e cada retry reutiliza a identidade original. `finalize` audita os resultados e reconcilia disciplina, arrecadação, pontos e ranking; testa ainda payload e operador divergentes para a chave de crédito. A spec final autentica 224 alunos e confere suas inscrições.

Os 15 jogos coletivos passaram pela UI em 9,2 minutos; cada ponto manteve o vínculo com um atleta elegível e a correção prevista. O gate completo mais recente levou 28 min 08,533 s. A chave offline concluiu duas semifinais e a final no mesmo browser preparado, depois reconciliou o ID temporário e os vencedores do servidor. Ponto, resultado e ocorrência foram confirmados no servidor antes da perda de resposta; crédito também foi confirmado antes do descarte na UI. Os retries preservaram a identidade e não duplicaram efeitos. A tentativa HTTP do segundo operador de reaproveitar a chave de crédito foi recusada com 409 sem alterar o histórico.

`-SimulationOnly` executa essas fases sem as suítes gerais; o gate completo roda integração, browser e visual gerais primeiro, reaplica migrações quando necessário e depois recria uma base descartável para a simulação. As fases da edição principal não fazem reset entre si. O projeto Playwright `database` permanece serial; a spec continua fora da allowlist `independent`.

Fechar contextos estudantis após cada jornada, preservando somente o estado necessário de forma segura. Não abrir 224 navegadores simultâneos: um contexto sequencial autentica cada aluno. Dois contextos de mesário são suficientes para a operação concorrente observada. Um worker de banco continua obrigatório.

## Testes de falhas e cobertura auxiliar

Casos de concorrência devem sincronizar na pré-condição com barreiras existentes, sem `sleep` arbitrário: disputa pela última vaga (uma inscrição aceita), duas publicações da mesma revisão (uma vence), dois operadores finalizando (efeito único), ponto concorrente ao encerramento (commit coerente ou recusa integral) e repetição de estorno. O gerador não deve escrever resultado inválido no banco para conseguir avançar.

Ensaios de 2/3/4/5/8 equipes, equipe vazia, campeão vindo de bye, menos de três atletas individuais, múltiplas equipes da mesma turma e modalidade adicional ficam em edições auxiliares. Eles ampliam as fronteiras do regulamento sem alterar os números do cenário principal. A simulação deve representar 100% do cenário declarado e listar explicitamente as variantes não suportadas.

Não transformar o projeto `database` em paralelo nem incluir a nova spec na allowlist `independent`. Restaurar edição ativa e recursos compartilhados de maneira segura no `finally`; exportar evidências antes de limpar recursos pertencentes exclusivamente à execução.

## E00 — Confirmar contratos e baseline

Ler AGENTS, pacote, rotas, migrações, testes e mudanças locais. Registrar baseline antes de editar implementação, com suites relevantes pelos runners isolados; refatoração exige suíte completa antes/depois. Confirmar defaults 7/224/10/35/322, capacidade individual e protocolo de mutação. Converter suposições pendentes em decisões documentadas.

**Entrega:** mapa de endpoints/métodos/ações, permissões, estados e envelopes por operação; versão e resultados da baseline. Não copiar um único formato `success`/`status` para todas as respostas sem conferir o contrato.

## E01 — Manifesto e resultado esperado

Implementar C01–C06 com validação de referências, turmas, gênero/categoria, distribuição, horários e custos. Escrever pequenos exemplos manuais que detectem erro do oráculo: ponto anulado não conta; penalidade subtrai uma vez; estorno devolve quantidade; correção troca beneficiário; bye não fabrica terceiro; dois medalhistas da mesma turma acumulam créditos quando permitido.

**Aceite:** nenhum cenário executa com referência inexistente, 31/33 alunos, quarta inscrição indevida ou total inconciliável. Resultado esperado congelado antes de operar, sem importar lógica de produção.

## E02 — Ambiente, atores e relatórios

Integrar TestDatabase/TestClient e relatórios ao runner sem mudar seu contrato de segurança. Implementar IDs únicos, clientes isolados, correlação por evento e snapshot sanitizado de estado. Verificar caminho de exportação dos artefatos dentro do container e no host; não deixar o relatório desaparecer no `down`.

**Aceite:** uma falha deliberada de asserção produz exit code não zero, checkpoint identificado e artefatos úteis; sucesso não é inferido apenas de processo sem exceção se o contador de Assertions registrar falhas.

## E03 — População, preparação e inscrição HTTP

Implementar S01–S06 com todos os alunos, revisões e preservação dos vínculos. Adicionar os casos negativos de inscrição e concorrência; cada um deve comprovar a regra pretendida, sem esbarrar antes em outra validação.

**Aceite:** inventário exato; 224 acessos, 322 inscrições; segunda/terceira publicação preservam tudo. Não inativar modalidades para facilitar a execução.

## E04 — Motor de eventos da competição

Implementar operação HTTP das partidas e provas, pontos com autoria, anulações, cronômetro, avanço e créditos. Usar o roteiro congelado, com referência aos atletas elegíveis. Arrecadação e disciplina devem se intercalar no livro da edição.

**Aceite:** 15 confrontos e 4 provas efetivamente concluídos e reconciliados; esperado por turma e por origem conferido em cada marco.

## E05 — Jornada de navegador completa

Construir ações com seletores acessíveis e autoespera, seguindo `fixtures.cjs`. Cobrir S01–S07/S09–S11, todos os alunos e retornos, sem mocks de sucesso de API. Asserir mensagens e estado visível além de resposta HTTP. Registrar console/pageerror e requisições inesperadamente falhas.

**Aceite:** cada partida e prova operadas pela UI; os 224 alunos autenticados e as 322 inscrições conferidas. O primeiro acesso visual (troca de senha, termos e inscrição) e o viewport responsivo dos 224 ainda ficam como pendência da matriz.

## E06 — Offline, reenvio e conflitos

Implementar S08 com IndexedDB real, servidor real e observador online. Confirmar sucessos persistidos mesmo quando a resposta é perdida e reenvios não duplicam. Adicionar falhas controladas de protocolo, sessão e chave de mutação; preservar operações recusadas.

**Aceite:** duas semifinais e final offline, reconciliação do ID temporário, vencedores/placares persistidos e fila vazia. V22 agora também confirma, na mesma edição, commit e replay idempotente de ponto, resultado, ocorrência e crédito. Expiração de sessão, CSRF renovado e respostas/protocolos inválidos seguem sem ensaio completo nesta edição.

## E07 — Encerramento, invariantes e repetibilidade

Concluir S11–S12, reconciliação independente, publicação por perfil e histórico. Executar variantes de bye, empate, ajuste/penalidade, limites de elencos e correções. Verificar resíduo da execução e restauração da edição ativa anterior.

**Aceite:** totais 427 de arrecadação, 400 de esportes e 35 de descontos no roteiro principal, líquido 792; números por turma/pódio/evento também coincidem. Toda lacuna de produto permanece visível.

## E08 — Gate completo e evidências

Executar regressões específicas e gate completo conforme [04-validacao-e-evidencias.md](04-validacao-e-evidencias.md). Repetir o cenário em ambiente limpo para conferir determinismo. Medir duração por fase e pico de contextos; não trocar participação completa por amostragem para ganhar tempo.

**Aceite desta rodada:** o gate completo passou em `docker-20260925_113751_9d23b2`, com 173/173 specs de navegador e contrato visual 2/2. A matriz tem 13 critérios aprovados, 14 parciais e 9 não executados; repetir em duas execuções limpas e fechar os critérios restantes segue pendente. V24 inclui conflito de identidade entre dois operadores na simulação. CI permanece obrigatório quando houver push autorizado.

## E09 — Documentação e entrega

Atualizar `docs/testing.md`, `tests/browser/README.md` e este STATUS com modo de execução, escala, saídas e limites. Documentar extensão do manifesto para outras salas. Revisar diff final e organizar commits somente do escopo pronto, conforme AGENTS, sem incorporar alterações preexistentes.

**Aceite:** outra pessoa consegue executar pelos runners oficiais, localizar o evento de uma falha e reproduzi-lo; nenhum push/deploy/merge faz parte automática desta implementação.
