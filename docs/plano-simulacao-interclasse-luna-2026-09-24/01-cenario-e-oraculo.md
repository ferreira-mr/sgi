# 01 — Manifesto, população e livro esperado

## C01 — Identidade e configuração determinística

Criar um manifesto versionado da simulação. Campos mínimos: versão, semente, fuso `America/Sao_Paulo`, instante-base, salas/categorias, alunos por sala, gêneros sintéticos, modalidades/limites, locais/janelas, valores de pontuação, roteiros por ator, eventos esportivos, eventos administrativos e falhas programadas.

Separar `run_id` (único para isolamento) da semente (estável para reproduzir o roteiro). Usar aliases como `6EF-A01` e `CAT-I-FUTSAL`, mapeados aos IDs devolvidos pela API. Não fixar IDs de banco nem escolher o primeiro resultado de uma busca ambígua. Matrículas devem obedecer ao formato aceito pelo sistema e ser sintéticas; senhas e cookies não pertencem ao manifesto publicado.

Data-base calculada uma vez por execução. Janelas de inscrição incluem o presente real do servidor; datas da competição podem ser futuras. Não tentar avançar o relógio do PHP apenas com relógio falso do navegador. Comprimir o tempo entre ações sem esperar dias ou vinte minutos de cronômetro. Testar cronômetro com controles legítimos e verificar se a aplicação exige data/estado para operar. Registrar a política temporal no manifesto.

## C02 — Todas as turmas

| Categoria | Turmas padrão | Alunos por turma | Total |
| --- | --- | --- | --- |
| I | 6EF, 7EF, 8EF | 32 | 96 |
| II | 9EF, 1EMA, 2EMA, 3EMA | 32 | 128 |
| Total | 7 turmas ativas | 32 | 224 |

Em cada turma, A01–A16 têm gênero sintético MASC e A17–A32 FEM. Isso é uma escolha de fixture para verificar as regras existentes, não uma afirmação sobre a composição da escola. Nomes, nascimentos, fotos opcionais e documentos devem ser fictícios. Não acrescentar alunos de cenários negativos ao total principal.

Se a escola fornecer turmas adicionais, declarar cada uma no manifesto e produzir novo orçamento de vagas, jogos e horários: `N_alunos = 32 × N_turmas`. Falhar se uma turma esperada estiver ausente, duplicada, inativa ou com 31/33 alunos. O cenário padrão não deve descobrir silenciosamente menos turmas e reduzir sua meta.

## C03 — Inscrições exatas por turma

Uma equipe/representação por turma e modalidade, `equipes_planejadas = 1`; manter os máximos padrão. Configurar mínimos sintéticos de 5 no futsal, 10 na queimada, 6 no vôlei e 2 em cada corrida, e máximos de 10/20/12/2/2, respectivamente. Esses mínimos são parâmetros do ensaio, sujeitos à validação do contrato atual, não regras esportivas oficiais. Não confundir número de equipes por turma com o total da categoria.

| Modalidade em cada categoria | Alunos de cada turma | Vagas ocupadas por turma | Total nas 7 turmas |
| --- | --- | --- | --- |
| Futsal - MA | A01–A10 | 10 | 70 |
| Queimada - MI | A01–A06, A11–A16, A17–A24 | 20 | 140 |
| Volei - MI | A07–A10, A25–A32 | 12 | 84 |
| Corrida - MA | A01–A02 | 2 | 14 |
| Corrida - FE | A17–A18 | 2 | 14 |
| Total | Todos os 32 alunos aparecem | 46 | 322 |

Distribuição por turma: **20 alunos com 1 modalidade, 10 com 2 e 2 com 3**. Na edição: 140/70/14 alunos, respectivamente. `140 + 70 + 14 = 224` e `140 + 2×70 + 3×14 = 322`. Há 21 representações coletivas e 14 vagas individuais de corrida: 35 pares lógicos turma/modalidade. O SGI exige uma equipe individual de um aluno por vaga; por isso a preparação operacional tem 35 equipes padrão mais 14 equipes individuais adicionais (49 linhas de equipe). As corridas têm 6 participantes por gênero na categoria I e 8 na II.

Cada aluno deve se autenticar, cumprir a troca inicial de senha se exigida, aceitar termos, consultar agenda e confirmar sua própria inscrição. Inscrições em segunda/terceira modalidade devem ocorrer também em visitas posteriores. Não usar a sessão administrativa nem inserção SQL como substituto da participação estudantil.

Reservar os últimos ocupantes de vagas para ensaiar disputa e recusas antes da inscrição final; os adversários do ensaio ficam em edição auxiliar ou o ensaio tem reversão suportada. Ao final, a edição principal deve coincidir exatamente com a tabela, sem inscritos extras.

## C04 — Agenda e orçamento de jogos

Cadastrar locais fictícios: Quadra Principal, Quadra Externa e Pista. Planejar cinco dias letivos de competição, com janelas de manhã, intervalo e margem entre compromissos. Exemplo de organização: dia 1 futsal; dia 2 queimada; dia 3 vôlei; dia 4 corridas; dia 5 reserva operacional. Finais podem ocorrer no mesmo dia da modalidade, com descanso positivo e sem colisão de candidatos a fases futuras.

Usar a configuração efetivamente suportada pelo gerador: duração sugerida de 20 minutos no futsal/queimada, 30 no vôlei, 15 por sessão de corrida e descanso de 10 minutos quando aplicável. Esses números são parâmetros da simulação, não regras oficiais. Comparar o tempo total calculado com as janelas antes de gerar. Se a API não permite distribuir exatamente por modalidade/dia, construir proposta válida pelo contrato existente e registrar a agenda realmente publicada antes das inscrições.

| Tipo | Categoria I | Categoria II | Total |
| --- | --- | --- | --- |
| Cada modalidade coletiva | 3 equipes, 2 confrontos reais | 4 equipes, 3 confrontos reais | 5 |
| Três modalidades coletivas | 6 confrontos | 9 confrontos | 15 |
| Corrida masculina e feminina | 2 provas, 12 participações | 2 provas, 16 participações | 4 provas / 28 participações |

Há três byes na categoria I, um por modalidade coletiva. Asserir sua progressão e ausência de pontos fictícios. Contar separadamente nós de planejamento, byes, jogos materializados, partidas por equipe e confrontos operados. Não impor `COUNT(jogos)=19` sem distinguir a representação persistida de bye.

## C05 — Livro de eventos e oráculo independente

Antes da primeira partida, congelar o roteiro de resultados por alias de nó e equipe. Pode resolver IDs e a topologia publicada para identificar os participantes; não pode ler o resultado produzido pelo sistema para decidir o esperado. Não chamar `PontuacaoRules`, `PodioRules`, `ChaveamentoRules` ou o ranking de produção para calcular o oráculo.

Usar uma tabela explícita de confrontos, vencedor, placar, autoria de cada ponto, anulados, ocorrências, pódio e horário. Na categoria I, escolher no roteiro principal campeão que disputou a semifinal real, garantindo terceiro derivável. Ensaiar campeão vindo de bye em cenário auxiliar, com ausência de terceiro quando esse for o contrato. Na categoria II, derivar terceiro do perdedor da semifinal do campeão, sem partida extra. Fixar essas escolhas antes de lançar qualquer placar.

Resultados sugeridos para diversidade: futsal 3–1, 2–0 e final 4–2; queimada 7–5 e final 6–4; vôlei 25–21 e final 25–23 se esses valores forem aceitos pelo contrato. O vôlei atual não deve receber sets fictícios: registrar no relatório a unidade realmente modelada pelo SGI. Distribuir pontos entre pelo menos dois atletas por equipe quando houver pontuação suficiente, acrescentar um ponto equivocado e anulá-lo em partida selecionada. Todos os pontos ativos devem fechar o placar.

Para corrida, declarar lista de chegada externa com 6/8 atletas e pódio com três IDs distintos inscritos. Persistir somente os campos suportados; posição do quarto em diante e tempos simulados pertencem ao roteiro, não a uma funcionalidade presumida. Incluir dois medalhistas da mesma turma em uma prova, se permitido, para conferir soma de créditos.

Cada evento contém: `event_id`, fase, ator, aliases dos recursos, operação, entrada sanitizada, pré-condição, efeito esperado, resultado observado e confirmação. A identidade de mutação deve permanecer estável em reenvios; uma nova tentativa de rede não é novo evento esportivo.

## C06 — Pontuação, arrecadação e disciplina

Configurar 20/12/8 pontos para 1º/2º/3º e 4 pontos por unidade arrecadada. Para a turma de índice `i` de 1 a 7, conforme a ordem de C02, lançar `10+i` unidades, depois `2.50`, estornar o segundo lançamento e lançar `1.25`. Quantidade final: `11.25+i`; pontos de arrecadação: `45+4i` (49, 53, 57, 61, 65, 69, 73), soma 427. Conferir histórico e estorno duplo recusado. Frações e arredondamento de fronteira são testados adicionalmente com valor ímpar em edição auxiliar.

Por turma, aplicar ocorrência individual de 2 pontos e ocorrência de turma de 3. Em uma turma, editar a individual de 2 para 4 e voltar a 2; em outra, inativar e restaurar pela ação suportada ou recriar com novo ID após cancelamento legítimo. Em uma terceira, criar ocorrência transitória de 7 e anulá-la. Ao fechar o roteiro, cada turma tem desconto ativo 5; total 35. Não presumir soft-delete para ocorrência de turma: conferir o contrato de exclusão atual.

Livro por turma:

```text
esportes = soma dos créditos ativos de pódio declarados no roteiro
arrecadacao = arredondamento contratual da quantidade final × valor do item
bruto = esportes + arrecadacao + ajuste explícito
penalidades = ocorrências individuais ativas + ocorrências de turma válidas
liquido = bruto - penalidades
```

Ajuste final do cenário principal é zero. Ensaiar ajuste administrativo autorizado e sua reversão em cenário auxiliar, sem usar ajuste para esconder erro de reconciliação. Para os dez pódios completos planejados, esportes somam `10×(20+12+8)=400`; bruto global 827; líquido global 792. Esses totais pressupõem o campeão fora do bye nas três chaves de categoria I e nenhuma correção final que suprima o terceiro. Se o contrato impedir o roteiro, registrar o bloqueio, sem adulterar o esperado para obter aprovação.

Antes da operação, gerar a tabela **por turma** com créditos esportivos, 49–73 de arrecadação, 5 de penalidades e ordem final esperada, a partir dos pódios congelados. Validar também cada checkpoint intermediário; uma soma global correta pode esconder crédito na turma errada. Ranking usa líquido decrescente e o desempate efetivo da consulta; ensaiar empate de pontuação e valores líquidos negativos separadamente.

Correção de final e de pódio individual deve produzir nova versão do livro e deltas explícitos, depois retornar ao roteiro principal por ação suportada. Não contar crédito antigo e novo simultaneamente. Se correção em certo estado for recusada, verificar a recusa sem modificação parcial e manter o caso como limite documentado.
