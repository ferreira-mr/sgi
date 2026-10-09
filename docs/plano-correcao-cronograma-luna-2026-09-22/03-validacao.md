# Matriz de regressão e evidências

## Comandos conferidos

Na raiz do repositório. `tools/test-docker.ps1` executa a bateria completa por padrão e não aceita `-Suite`.

```powershell
# Baseline e entrega: qualidade, integração, navegador e visual
powershell -ExecutionPolicy Bypass -File tools/test-docker.ps1 -Database mariadb -IncludeVisual

# Desenvolvimento sem SQL
powershell -ExecutionPolicy Bypass -File tools/test-local.ps1 -Suite quality
php vendor/bin/phpunit --configuration phpunit.xml --filter Cronograma

# Perfis focados com SQL sempre descartável
powershell -ExecutionPolicy Bypass -File tools/test-local.ps1 -Suite integration -Database mariadb
powershell -ExecutionPolicy Bypass -File tools/test-local.ps1 -Suite browser -Database mariadb

# Alternativa completa com runtimes locais e SQL em container
powershell -ExecutionPolicy Bypass -File tools/test-local.ps1 -Suite all -Database mariadb -IncludeVisual

git diff --check
```

Linux/macOS: `sh tools/test-docker.sh --database mariadb --include-visual`. A validação deste pacote usa exclusivamente MariaDB 10.11, conforme a decisão de execução adotada durante a implementação. Não usar `-SkipQuality`/`-SkipBrowser` como homologação final. Não executar integração, seed ou Playwright contra SQL local; não apontar para o desenvolvimento em 8080. Filtro PHPUnit acima é unitário; não é substituto da integração. Não inventar flags de filtro no wrapper.

## Cobertura obrigatória

| ID | Cenário e asserção observável | Etapas | Camada mínima |
| --- | --- | --- | --- |
| V01 | Relatório/artefato do navegador permanece após executar visual; execuções distintas não colidem | C01 | Teste de executor + bateria real |
| V02 | Instalação limpa/repetição, FKs/unicidade, falha/recuperação de migração sem apagar marcador | C02 | Integração MariaDB 10.11 |
| V03 | N entradas por turma, repetição e concorrência conservam IDs; redução inválida não remove vínculos | C03 | Unitário + SQL concorrente |
| V04 | 3/4 turmas × uma entrada produzem 2/3 jogos; categorias distintas nunca se enfrentam | C03 | Unitário + SQL |
| V05 | Duas modalidades com mesmos slots não colidem; `id_no` de outra edição/versão é recusado | C02, C08 | Unitário + HTTP/SQL |
| V06 | Seis entradas: BYE intermediário propaga vencedor real, não primeiro candidato; origem pendente/empate bloqueia | C03, C08 | Unitário + SQL + jornada |
| V07 | Individual em mata-mata, dupla em mata-mata e prova por marcas seguem caminhos corretos | C03, C08 | Unitário + HTTP + navegador |
| V08 | Data impossível, hora/intervalo inválido isolado, janela/duração insuficiente recusados; nenhuma fase omitida | C04 | Unitário + HTTP |
| V09 | Dois recursos acomodam jogos independentes; dependentes respeitam ordem/descanso; resultado determinístico | C04 | Unitário + SQL |
| V10 | Publicação sem todos os compromissos, com nó duplicado/cíclico/órfão ou candidato adulterado não grava snapshot | C05 | Unitário + HTTP/SQL |
| V11 | Equipe/turma/local de outra edição/categoria, local inativo e reserva criada após simulação bloqueiam | C05 | HTTP/SQL |
| V12 | Jogo manual conflita com publicação; materialização da própria reserva não conflita consigo nem duplica ocupação | C04, C07, C08 | HTTP/SQL |
| V13 | Aluno antes da abertura e exatamente no fechamento é recusado; na abertura aceita; fuso explícito | C06 | Relógio unitário + HTTP real |
| V14 | Revisão ausente/antiga, publicação suspensa e duas alterações seguidas em revisão invalidam tokens | C05, C06 | HTTP/SQL + duas abas |
| V15 | Equipe escolhida recebe vínculo exato; equipe lotada não desvia aluno; reenvio não duplica; outra equipe da mesma modalidade recusa | C06 | HTTP/SQL + navegador |
| V16 | Válida+lotada/inexistente/inativa/de outra turma/conflitante deixam zero vínculos novos; falha intermediária faz rollback | C06 | HTTP/SQL |
| V17 | Gênero, categoria, turma, três modalidades, termos, primeiro acesso, CSRF e sessão revogada continuam protegidos | C06, C07 | Unitário + HTTP |
| V18 | Finais possíveis de modalidades distintas conflitam; ramos inalcançáveis não; margem zero permite adjacência e positiva bloqueia | C04, C06 | Unitário + HTTP/SQL |
| V19 | Republicar agenda que conflita para aluno já inscrito é recusado; transferência inválida conserva origem | C05, C07 | HTTP/SQL |
| V20 | Disputa pela última vaga e inscrição versus fechar/revisar/publicar produzem estado serializado coerente | C05, C06 | Concorrência com barreiras |
| V21 | Mínimo−1, aluno inelegível ou inscrições abertas impedem operação; mínimo completo permite; retirada exige resolução | C08 | Unitário + HTTP/SQL |
| V22 | Materialização/reenvio/resultados produzem um jogo, pontos vinculados e sucessora correta; falha preserva atomicidade | C08 | SQL + JS + navegador |
| V23 | Revisão mantém publicação suspensa consultável e jogos iniciados íntegros; revisão muda com escritores administrativos | C05, C07 | HTTP/SQL |
| V24 | Mudar parâmetro invalida prévia; publicar/abrir têm recuperação independente; HTML 200/JSON inválido não confirma; segunda revisão e duplo clique funcionam | C09 | JS + navegador |
| V25 | Mesário preparado offline conserva fila na revisão/reconexão, detecta obsolescência, renova CSRF e não duplica; inscrição/publicação não entram na fila | C10 | JS + IndexedDB real/Playwright |
| V26 | Jornada sem mocks, quatro perfis, mobile/desktop, teclado, raiz/subdiretório e reentrada; visual cobre agenda e pendências | C09–C12 | HTTP + navegador + visual |

Adicionar casos descobertos durante implementação; a tabela é o mínimo, não um limite. Testar sucesso, inválidos e limites. Não testar apenas contagens ou formato do array quando o requisito envolve participantes, persistência ou autorização. Não escolher IDs que existam por acaso na base.

## Organização e execução dos testes

- Unitários de regras e casos de uso em `tests/Unit/Modules/Competicoes/` e `Participantes/`. Dublês implementam o contrato final sem importar Infrastructure para Application.
- Estender `CronogramaPlanejadoTest`, `InscricaoModalidadesTest`, os testes de concorrência e migração existentes. Nova classe de integração deve ser incluída e chamada em `tests/run_all.php`.
- Arquivos JS descobertos por `npm test` em `tests/javascript/*.test.cjs`; usar testes de comportamento do runtime/handlers, não buscas textuais como prova de funcionamento.
- Playwright com fixtures sintéticas próprias e login/CSRF reais. Jornada principal não intercepta APIs centrais. Mocks só em testes separados de falhas de rede/envelope.
- Fixture de cronograma não deve desativar todas as outras turmas para esconder a falha entre turmas. Preparar edição própria, duas categorias, 3/4 turmas, pelo menos duas modalidades elegíveis para o mesmo aluno e duas quadras.
- Cleanup limita-se aos registros da fixture, com ordem de dependências. Não derrubar tabelas compartilhadas a cada cenário nem retirar indiscriminadamente migrations para fazer o seguinte funcionar. Teste de instalação/DDL usa seu próprio banco descartável do executor.
- Concorrência usa duas conexões/sessões e barreiras do harness: aguardar aquisição de lock/etapa, liberar e assertar respostas/estado final. Não depender de `sleep` para vencer corrida.

## Jornada sintética final

Configurar futsal com uma equipe por turma, dupla em mata-mata, duas entradas individuais por turma em mata-mata e prova individual por marcas, respeitando categorias. Planejar antes de inserir atletas. Provocar falta de janela, corrigir e publicar; abrir com período válido. Inscrever aluno em equipe exata e recusar conflito somente na final. Disputar última vaga, testar revisão antiga e lote parcialmente inválido. Encerrar, resolver mínimos e operar semifinal/final reais. Preparar mesário, operar offline na mesma aba, revisar horário em outra sessão, reconectar e verificar resultado/avanço/fila/estado. Repetir consulta em subdiretório sem URL fixa.

Essa jornada não substitui negativos menores: uma falha no início não deve impedir a descoberta das outras regressões na mesma execução.

## Como registrar evidências

Para cada etapa/Vxx registrar em STATUS: commit/árvore, horário com fuso, comando exato, ambiente/URL isolada, resultado/exit code, teste responsável, esperado/observado, logs, retry/skip e próxima ação. Usar identificador comum de execução entre log do runner, servidor/API e navegador quando disponível; apontar limitações reais de correlação.

Guardar falha antes da correção e aprovação depois em caminhos distintos por execução/perfil. Não registrar segredos, senhas, CSRF nem dados pessoais reais. Screenshot/trace precisa existir no disco antes de ser citado. Inspecionar snapshots do cronograma antes de atualizar baseline da plataforma correta.

Testes escritos não são testes executados. Suíte verde sem os casos Vxx não fecha achados. Retry não apaga a falha inicial. Não afirmar CI remoto verde com testes locais. Se houver impedimento, deixar etapa “Parcial” ou “Impedida”, explicar o erro e o que falta; não marcar aceites sem evidência.

## Verificação deste pacote documental

Na criação do plano: validar caminhos, links, comandos e `git diff --check`. Não executar banco, build ou suíte da aplicação somente para validar Markdown. A bateria funcional acima é obrigação da implementação posterior.
