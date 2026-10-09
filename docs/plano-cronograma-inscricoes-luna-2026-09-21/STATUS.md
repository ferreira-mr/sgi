# Progresso — cronograma anterior às inscrições

## Referência e estado

- Plano criado em 21/09/2026.
- Checkout de referência: `c8e9c1be85a49bccfa0c6cca88db97d11f33ed2f`.
- Estado da funcionalidade: **não implementada**.
- Baseline funcional: **não executado neste trabalho documental**.
- Inspeção inicial: árvore de trabalho limpa; leitura de README, AGENTS, guias, exemplos de planos, schema, rotas e pontos centrais de modalidade/equipe/inscrição/agenda.
- Escopo confirmado: sem cabo de guerra, sem disputa entre categorias; recursos compartilhados continuam sujeitos a conflitos.

## Tarefas

| Tarefa | Estado | Arquivos/decisões | Testes/evidências | Próxima ação |
| --- | --- | --- | --- | --- |
| T00 | Não iniciada | — | Baseline não executado | Mapear escritores e executar baseline isolado. |
| T01 | Não iniciada | — | — | Depende de T00. |
| T02 | Não iniciada | — | — | Depende de T01. |
| T03 | Não iniciada | — | — | Depende de T02. |
| T04 | Não iniciada | — | — | Depende de T03. |
| T05 | Não iniciada | — | — | Depende de T04. |
| T06 | Não iniciada | — | — | Depende de T05. |
| T07 | Não iniciada | — | — | Depende de T01–T06. |
| T08 | Não iniciada | — | — | Depende de T06–T07. |
| T09 | Não iniciada | — | — | Depende de todas as anteriores. |

Estados permitidos: não iniciada, em andamento, implementada com validação pendente, validada, impedida. Registrar condição concreta para impedimentos. Não promover etapa a validada sem os testes exigidos.

## Decisões técnicas a registrar durante T00/T01

- Inventário de rotas escritoras e ordem de locks existente/proposta.
- DDL final, número da migration e convergência baseline/upgrade.
- Mapeamento de entradas individuais para os participantes reais existentes.
- Identidade dos nós, momento de materialização e integração com avanço offline.
- Contratos HTTP finais e permissões por operação.
- Política de adoção das edições antigas e tratamento de ambiguidades.
- Tokens/componentes reutilizados e telas impactadas.

## Configuração pendente do evento real

Datas, durações por confronto/prova, recursos simultâneos, turmas participantes, mínimos de elenco, formatos dos representantes, agenda final por categoria e tratamento do terceiro lugar quando o campeão teve BYE. Não são motivo para inventar valores de produção; desenvolvimento usa cenários sintéticos explícitos.

## Modelo de registro por execução

```text
Tarefa / IDs Vxx:
Data/hora e fuso:
Commit e alterações sob teste:
Ambiente/URL isolada e motor SQL:
Comando exato:
Exit code e contagens:
Cenário / esperado / observado:
Logs e relatório/capturas:
Falhas preexistentes ou introduzidas:
Limitações e próximos passos:
```

## Retomada

Começar por T00 em [etapas](03-etapas-de-implementacao.md). Não executar migrations em base de trabalho, não iniciar implementação de ranking fora do escopo e não considerar decisões históricas de outros planos como autorização para apagar dados.

## Verificação documental em 21/09/2026

- Seis documentos criados; nenhum arquivo de aplicação alterado.
- Links Markdown relativos verificados por resolução no filesystem: todos válidos.
- 25 referências completas de caminhos do código/infraestrutura conferidas: presentes. Nomes de classes e rotas propostas estão identificados como propostas no texto.
- Parâmetros dos comandos conferidos em `tools/test-docker.ps1` e `tools/test-local.ps1`; o wrapper Docker não recebe `-Suite`.
- `git diff --check` e `git diff --cached --check`: sem erros; diff e stage revisados, limitados aos seis documentos deste pacote.
- Sem build, banco, seeds ou testes de produto nesta tarefa exclusivamente documental, conforme AGENTS. Isso não valida a funcionalidade planejada.
