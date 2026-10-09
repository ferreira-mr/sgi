# Segundo ciclo do cronograma — plano para Luna

**Estado: implementação concluída; gate completo aprovado e integração validada nos dois motores em [STATUS](STATUS.md).** Data: 23/09/2026, America/Sao_Paulo. Checkout de referência: `1ac473ce782c8268e9e817b785ca6b20e95b3211`, com alterações preexistentes preservadas. Consulte o STATUS para os comandos, run IDs, resultados e limitações efetivamente observados.

## Objetivo

Permitir preparar, gerar rascunho, publicar, abrir/encerrar inscrições, revisar e republicar repetidamente na mesma página, antes da liberação da competição. A revisão deve substituir a agenda anterior sem competir pelos seus próprios horários. Depois da liberação, manter o bloqueio de substituição da árvore e explicar esse estado na interface.

Foram encontrados defeitos reais que explicam a diferença entre o primeiro uso e os seguintes. Não foi identificado uso de URL PHP procedural na geração do painel: ela chama `/api/v1/cronograma`. A interface sequencial concorrente foi removida desta página. A rota `/api/v1/agenda-blocos` continua atendendo consultas de reservas feitas pelo shell offline atual do mesário e não é uma camada de compatibilidade com versões antigas.

Não é possível atribuir com certeza o incidente do usuário a um único defeito sem a resposta de rede daquela tentativa. As evidências e seus limites estão no [diagnóstico](00-diagnostico.md).

## Premissa expressa do usuário

O sistema será implantado do zero, sem dados, e **não exige compatibilidade com versões anteriores**. Atualizar frontend, servidor, offline, fixtures e testes para um único contrato. Não criar aliases, adaptadores, leitura dupla ou migração de formatos antigos para este trabalho. Remover caminhos obsoletos do fluxo quando os consumidores atuais forem convertidos.

Essa instrução supera premissas de compatibilidade nos planos históricos. Não confundir versão antiga do software com revisão atual de uma agenda: concorrência entre abas, inscrições, resultados e filas criados na versão nova continuam exigindo consistência. A instalação nova também não autoriza apagar bases locais existentes, limpar IndexedDB pessoal ou alterar o trabalho de outras tarefas. Não há necessidade demonstrada de mudar schema para os defeitos encontrados; se isso mudar, documentar a necessidade e validar instalação vazia e reaplicação pelo runner.

## Ordem de execução

1. Conferir AGENTS.md, README do projeto, arquitetura, testes e as alterações preexistentes do checkout.
2. Usar [diagnóstico](00-diagnostico.md), [contrato](01-contrato.md), [etapas](02-etapas.md) e [validação](03-validacao.md) como critérios de execução e aceite.
3. Executar S00–S06, registrando as evidências reais em [STATUS](STATUS.md); a tabela de aceites deve refletir apenas cenários comprovados.
4. O pacote orienta esta implementação e sua regressão. [PROMPT-LUNA.md](PROMPT-LUNA.md) é referência e não exige abrir outra tarefa.

Este pacote complementa [fluxo único](../plano-fluxo-unico-competicao-luna-2026-09-23/README.md) e [correções anteriores](../plano-correcao-cronograma-luna-2026-09-22/README.md). Não reimplementar etapas já resolvidas, nem aceitar o STATUS antigo como comprovação dos novos aceites.

## Entrega

Correção funcional com regressões permanentes descobertas pelos runners existentes, jornada repetida no navegador, resultados completos registrados e documentação operacional atualizada. Não fazer push, merge ou deploy. Preservar alterações preexistentes, especialmente no repositório de cronograma, testes de integração e jornada E2E. A premissa de instalação nova sem compatibilidade antiga vale para o contrato desta entrega; reservas e dados criados pela versão atual continuam sujeitos às regras de consistência.
