# Regras de negócio e fluxos

## 1. Origem e limites do regulamento

O documento fornecido descreve duas categorias: três turmas na primeira e quatro na segunda; eliminatórias na segunda-feira e finais na quinta-feira; atividades simultâneas em quadra, pátio, biblioteca, Bloco 2 e salas. São dados de referência para o evento, não limites fixos da aplicação. O usuário retirou cabo de guerra e qualquer interação competitiva entre categorias.

Antes de configurar o evento real, a coordenação precisa definir datas completas, quantidade de recursos simultâneos, horários por categoria/fase, formato dos representantes e tratamento dos cinco minutos de transição. A grade contém finais repetidas nos dois dias e blocos com mais de um jogo; não convertê-los automaticamente em confrontos definitivos. Não gerar cinco jogos para toda modalidade: esse total só corresponde ao mata-mata com uma entrada por turma nas duas categorias descritas.

## 2. Invariantes identificadas

| ID | Regra obrigatória |
| --- | --- |
| R01 | Cada modalidade pertence a uma edição e categoria; turmas, equipes, adversários e sucessoras pertencem ao mesmo escopo. |
| R02 | Quantidade planejada por turma é um inteiro positivo finito; zero, vazio, ilimitado, negativos e frações não autorizam planejamento. |
| R03 | Para cada turma selecionada, criar exatamente N entradas estáveis, independentemente do elenco. Repetição não duplica nem renomeia vínculos existentes. |
| R04 | Equipe vazia planejada não é WO, derrota, BYE nem motivo para avançar automaticamente. |
| R05 | Todos os compromissos obrigatórios e condicionais possuem data, início, término e recurso antes da publicação. |
| R06 | Recursos são exclusivos por intervalo, inclusive entre categorias. Pessoas não participam de atividades simultâneas nem no mesmo local. |
| R07 | Inscrição depende de versão publicada, janela aberta e elegibilidade; controle é obrigatório no servidor. |
| R08 | O vínculo é com a equipe escolhida, sem redirecionar para a equipe padrão. Uma equipe por modalidade por aluno; continuam no máximo três modalidades. |
| R09 | Conflitos confirmados e possíveis em fases futuras impedem inscrição e transferência. |
| R10 | Confirmação de várias escolhas é atômica. Qualquer escolha inválida impede todas as novas gravações da operação. |
| R11 | Mudanças de cronograma ou elenco passam pela mesma regra de agenda; nenhuma rota administrativa é um desvio silencioso. |
| R12 | Mudanças não apagam partidas, inscrições, resultados ou operações offline pendentes. |

## 3. Configuração de participação

Na primeira versão, o administrador escolhe turmas ativas da categoria e uma quantidade uniforme por turma. Validar que pertencem à edição. Não implementar quantidade variável por turma sem necessidade posterior.

Separar formato de participação (equipe, dupla, individual) do formato de competição (`mata_mata` ou `individual` conforme contrato atual). Uma dupla pode disputar mata-mata; um representante individual também. Não deduzir formato pelo nome do esporte.

No fluxo planejado, exigir capacidade máxima finita e mínimo positivo menor ou igual ao máximo. Para dupla, mínimo e máximo iguais a dois; para entrada individual, iguais a um. Para equipe, os valores são configurados, incluindo reservas no máximo. Composição mista numérica não está definida pelo regulamento: preservar elegibilidade atual sem inventar proporções.

Exemplos sintéticos: uma equipe de futsal por turma com máximo dez; uma dupla de tênis de mesa por turma; duas entradas individuais de xadrez por turma. Para corrida M/F, representar as provas elegíveis explicitamente, sem permitir que o mesmo aluno ocupe duas entradas incompatíveis. Arremesso por marcas usa sessões individuais, não mata-mata forçado.

`max_equipes` continua sendo limite. A quantidade planejada deve respeitá-lo quando finito. Na interface nova, manter um único campo principal de quantidade e sincronizar o limite quando apropriado para não apresentar configurações contraditórias; dados antigos continuam explícitos e não são reinterpretados. Explicar a decisão final em STATUS.

## 4. Estados e transições

Estados de negócio não substituem os ENUMs atuais de status de jogo/equipe.

| Ação | Pré-condição | Efeito |
| --- | --- | --- |
| Concluir configuração | Todas as modalidades participantes completas | Permite preparar estrutura e simular agenda. |
| Preparar | Quantidades e turmas válidas | Cria entradas sem elenco e estrutura estável; inscrições fechadas. |
| Publicar | Estrutura íntegra, agenda completa e sem pendências | Define uma versão publicada imutável. |
| Abrir inscrições | Versão publicada válida e período configurado | Aceita escolhas elegíveis no período. |
| Encerrar | Inscrições abertas | Impede novas escolhas; mantém consultas e vínculos. |
| Iniciar revisão | Existe publicação | Fecha inscrições e cria rascunho; última publicação continua visível. |
| Republicar | Impacto validado e sem conflitos novos não resolvidos | Troca publicação atomicamente; reabertura é explícita. |
| Liberar operação | Inscrições encerradas, mínimos atendidos ou retiradas resolvidas | Permite execução dos jogos no fluxo planejado. |

Período usa intervalo `[abertura, encerramento)`, com fuso explícito da edição ou configuração da aplicação. Antes da abertura e exatamente no encerramento, recusar. Não confiar no relógio do navegador. Desistência/remoção continua possível conforme autorização atual, mas recalcula aptidão e não elimina histórico.

A versão publicada é referência para a inscrição; a revisão de trabalho muda com toda alteração relevante (modalidade, turma participante, elenco, recurso, chaveamento ou horário). Simulação antiga não pode sobrescrever trabalho novo.

## 5. Algoritmo de disponibilidade do aluno

Para cada entrada, obter sua partida inicial e todas as sucessoras alcançáveis na chave, ou as sessões obrigatórias/condicionais da prova individual. BYE estrutural não ocupa horário de jogo. Eliminação efetiva remove compromissos condicionais que deixaram de ser possíveis, sem apagar o histórico.

Comparar somente compromissos de inscrições diferentes do aluno. Não comparar o aluno com os dois lados de sua própria final nem reservar para ele jogos de outras equipes que não sejam alcançáveis. Elenco inteiro, inclusive reservas, precisa estar disponível.

Em uma data, intervalos são semiabertos `[início, fim)`. Para A antes de B, exigir `fim(A) + margem(A,B) <= início(B)`. Margem é o maior valor entre descanso individual aplicável e deslocamento configurado; não somar duas vezes a mesma margem. Intervalo de troca do recurso é validado separadamente. Na primeira versão, deslocamento pode ser uma configuração global entre locais diferentes; no mesmo local, zero de deslocamento, preservando descanso.

Exemplos de aceite: 08:00–08:20 e 08:20–08:40 são compatíveis com margem zero; o segundo é incompatível se houver cinco minutos de deslocamento. Final possível às 10:00 conflita com outra final possível às 10:00, mesmo sem classificados definidos. Datas diferentes não conflitam. Horário ausente é pendência, nunca disponibilidade livre.

Mensagens devem identificar modalidade, equipe, data, início/fim, local e se a presença depende da classificação. Não expor elenco de outras turmas na resposta do aluno.

## 6. Equipes incompletas e revisão

Durante inscrições, elenco abaixo do mínimo é esperado. No encerramento, listar pendências; não preencher automaticamente nem sortear novamente. Transferência é atômica: validar destino antes de remover origem. Retirada de equipe exige análise de chaveamento e nova publicação quando alterar compromissos.

Para a primeira entrega, republicação com conflitos individuais não resolvidos é bloqueada. Em chuva ou emergência, permitir fechar inscrições e registrar suspensão operacional, preservando a última agenda como suspensa/desatualizada e as pendências visíveis; não apresentar uma programação inviável como validada. Não criar override que permita inscrições conflitantes. Fluxo emergencial mais permissivo é evolução posterior.

Após jogo iniciado, impedir regeneração destrutiva da estrutura. Horários de jogos ainda não iniciados só mudam por revisão. Dados já preparados offline podem estar antigos: sinalizar atualização necessária na reconexão e preservar a fila.
