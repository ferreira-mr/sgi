# Matriz de validação do manual

Uma linha passa somente com evidência observável e link para o capítulo/seção correspondente. “Pendente” e “não disponível na versão” são resultados legítimos de auditoria, mas não contam como funcionalidade documentada. Registrar em `STATUS.md` o perfil, edição fictícia, HEAD, URL/ambiente e data/fuso de cada verificação; não guardar credenciais ou dados pessoais.

| ID | O leitor deve conseguir... | Evidência mínima |
| --- | --- | --- |
| V01 | Encontrar o início rápido e uma tarefa pelo perfil ou pelo índice | Abrir todos os links do índice e seguir uma tarefa de cada perfil |
| V02 | Entrar pelo login único, sair e entender sessão expirada | Navegador com destino por perfil e estados de erro/sucesso |
| V03 | Concluir primeiro acesso do aluno na ordem senha → termos | UI/guardas e teste de tentativa de avançar antes de cada passo |
| V04 | Criar/selecionar edição e reconhecer qual edição está em uso | Jornada administrativa e identificação da edição nas telas seguintes |
| V05 | Configurar categorias, turmas e alunos/importação real | Procedimentos e um cenário de erro de validação sem dados reais |
| V06 | Configurar locais/regulamento, modalidades, regras e equipes | Dados fictícios salvos e recuperados após navegar |
| V07 | Entender o que administrador, colaborador e mesário podem ler/alterar | Matriz M01 comparada com guarda/controlador e UI por perfil |
| V08 | Gerar, conferir e publicar cronograma antes de abrir inscrições | Jornada UI com prévia, publicação e compromisso visível |
| V09 | Revisar programação quando permitido e reconhecer bloqueio pós-liberação | UI/contrato para revisão, pendência e estado bloqueado |
| V10 | Abrir/encerrar inscrições, resolver mínimos e liberar competição | Jornada UI com elenco válido e negativo de mínimo/janela |
| V11 | Consultar agenda e inscrever aluno, respeitando até três modalidades | Conta fictícia, confirmação e cenários de conflito/lotação |
| V12 | Operar jogo, corrigir evento e confirmar resultado/avanço | Placar + árvore/histórico após resultado, por variante real |
| V13 | Preparar e usar offline, distinguir pendente, erro e confirmado | Mesma aba preparada, desligar rede no navegador, reconectar e verificar |
| V14 | Registrar/consultar ocorrências e arrecadações conforme permissão | UI e efeito posterior na consulta/ranking quando aplicável |
| V15 | Ler ranking, histórico e visibilidade por edição/perfil | Estado publicado e não publicado, sem inferir apenas pelo status da edição |
| V16 | Recuperar erros frequentes sem perder dados ou repetir mutação incerta | Cada item de `07-problemas-comuns.md` aponta a ação segura e capítulo |
| V17 | Usar o manual em celular e com tecnologias assistivas | Títulos, links, alt text, ordem de leitura e controles por nome, não só cor/posição |
| V18 | Confiar na integridade editorial do pacote | Links/arquivos existentes, imagens sanitizadas, versão/data, diff check limpo |

## Método de verificação

1. **Contratos:** para cada Vxx, apontar rota de página, view/JS, controlador/guarda e teste existente quando houver. Requisitos antigos não bastam como prova.
2. **Navegação real:** seguir o manual no navegador em ambiente isolado e dados sintéticos. Registrar `passou`, `falhou`, `parcial` ou `não aplicável`, com motivo. Sem observação de UI, registrar “inspeção de código” e deixar a linha parcial.
3. **Mídia e links:** conferir todos os links relativos e imagens, nomes, legibilidade, textos alternativos e ausência de informações sensíveis. Um script simples pode ajudar a achar destinos inexistentes, mas a checagem humana de âncoras e legibilidade continua necessária.
4. **Revisão técnica e leiga:** pedir a alguém que não escreveu o capítulo para seguir J01–J05 a partir do índice, anotando o primeiro passo ambíguo. Revisar texto e repetir o passo afetado.
5. **Comandos:** para uma alteração somente documental, conferir caminhos, links e comandos com os scripts reais e executar `git diff --check`. Não executar a bateria completa de SQL/navegador só para validar Markdown. Se a implementação também mudar a aplicação, aplicar os testes do AGENTS para a mudança funcional e registrar separadamente.

## Registro esperado no STATUS

```text
Vxx | estado | capítulo/âncora | código/teste de referência | ambiente e perfil
    | esperado | observado | imagem/log (se existir) | limite/próxima ação
```

Não marcar “aprovado” com captura antiga, mera presença de botão, teste mockado de rede ou resposta de um perfil diferente. Capturas e logs citados devem existir. Uma falha de produto descoberta durante a redação não deve ser escondida com uma instrução alternativa não suportada.
