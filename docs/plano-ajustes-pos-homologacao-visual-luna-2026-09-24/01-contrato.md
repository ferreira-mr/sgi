# Contrato de comportamento alvo

## Indicadores e histórico da edição

- `Jogos` conta confrontos reais da edição acessível, incluindo agendados, iniciados e concluídos; nós virtuais/bye não contam como jogo realizado. `Pendentes` conta os confrontos reais ainda não concluídos. Os números não devem cair para zero apenas porque todos terminaram.
- `Campeões` conta **modalidades** com campeão confirmado uma vez cada, não finais por nome ou participantes vencedores. Em modalidade coletiva, usar a final concluída com vencedor estruturado do chaveamento, ou um campo de domínio equivalente; a identificação não depende de prefixo `MM:`/`PL:`. Em modalidade individual, usar o resultado/ranking final confirmado conforme o contrato atual, sem contar uma prova meramente iniciada. Após a final do cenário, o esperado é 1 campeão em 1 modalidade.
- A árvore, os indicadores e `Jogos Realizados` devem usar dados do mesmo recorte de edição e estado confirmado. Mudança de modalidade/categoria pode filtrar a tabela, mas não deve trocar silenciosamente o escopo dos indicadores gerais. Recarregar, retornar à página ou sincronizar um resultado não pode gerar números divergentes.
- Administrador/colaborador autorizado pode consultar o histórico conforme a política da edição; mesário só consulta a edição ativa. O histórico concluído é leitura, sem ampliar permissão para criar, reagendar, editar resultado ou consultar outra edição. O filtro operacional existente continua adequado para agenda e preparo offline; se for necessário um contrato de leitura histórica, torná-lo explícito, autorizado no servidor e documentado. Aluno e anônimo seguem suas políticas atuais; não expor resultados/ranking antes da publicação permitida.
- Em conexão offline preparada, mostrar dados locais reconciliáveis com o servidor e indicar fonte/estado quando necessário. Não limpar a fila nem trocar o escopo do operador. Depois de reconectar, comparar os cinco resultados e o campeão sem contagem dupla.

## Coluna de tempo

- A coluna **Tempo** deve ter semântica única e nome coerente. Decisão proposta: mostrar a **duração regulamentar/configurada** de `duracao_jogo` em segundos quando esse for o dado disponível; não chamar de duração efetiva. Se o produto exigir duração efetiva, implementar e testar uma fonte real de início e fim, inclusive pausas/retomadas e virada de dia, antes de exibi-la.
- Nunca subtrair `termino_jogo` agendado de `data_inicio_real` (datetime real) para inferir duração. `NaN`, `Infinity`, valores negativos ou texto quebrado não podem aparecer. Valor ausente, nulo ou inválido deve resultar em marcador acessível (`—`/`Não informado`), não em zero inventado. Testar segundos, minutos e horas, inclusive `0`, dado não numérico e jogo pendente.
- Se a coluna passar a dizer `Tempo previsto`, atualizar cabeçalhos desktop/mobile e teste visual com rótulo consistente. Uma mudança de CSS/layout exige design system compartilhado e `-IncludeVisual`.

## Encerramento de sessão

- O controle **Sair** de administrador, colaborador, mesário e aluno abre confirmação; cancelar mantém a sessão. Confirmar envia **um** POST autenticado com token CSRF válido para `/api/v1/logout`. GET não encerra sessão. Botões, links, teclado e menu móvel devem seguir o mesmo contrato; não depender do `href` GET como ação funcional.
- Após confirmação **bem-sucedida pelo servidor**, destruir sessão/cookie, limpar apenas estado sensível de navegação apropriado, navegar ao login correto e negar reentrada por voltar/URL direta. Falha de rede, 403 CSRF, 405, resposta inesperada ou cancelamento não pode aparentar sucesso; mostrar erro e permitir nova tentativa. Reentrada na página não duplica handlers.
- Preferir um manipulador compartilhado em fonte JS carregada por `Assets`, seguindo `page-runtime`, em vez de manter duas rotinas inline divergentes em `admin-head.php` e `aluno-head.php`. Se a resposta da API mudar para confirmação JSON/204 própria de fetch, atualizar os clientes e testes atuais em conjunto. Preservar CSRF; não habilitar logout por GET.

## Regra do bye

Verificar seis equipes contra o algoritmo e a regra de competição vigente: cada equipe deve seguir uma trilha determinística até a final; bye não gera partida, pontuação, resultado ou campeão; nenhum confronto real pode ser duplicado ou saltado indevidamente. Se o avanço direto for a regra adotada, registrar um teste que fixe o pareamento e o número de partidas. Se não for, documentar o esperado e corrigir o gerador/avanço com testes de unidade, integração e navegador, sem alterar silenciosamente os cinco resultados da evidência histórica.
