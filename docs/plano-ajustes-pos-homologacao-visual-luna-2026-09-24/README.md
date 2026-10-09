# Ajustes após a homologação visual da competição — plano para Luna

**Estado: implementado e validado.** Atualizado em 24/09/2026, America/Sao_Paulo. Evidência de origem: [relatório da homologação](../../test-results-homologacao-visual-20260924/relatorio.md), executado no `HEAD` `1ac473ce` com alterações locais. Os [prints 23](../../test-results-homologacao-visual-20260924/23-chaveamento-campeao-final.jpg), [24](../../test-results-homologacao-visual-20260924/24-indicadores-historico-inconsistente.jpg) e [25](../../test-results-homologacao-visual-20260924/25-historico-jogos-com-duracao-invalida.jpg) registram os sintomas originais. A implementação, decisões, limitações e run final estão em [STATUS](STATUS.md).

## Objetivo e alcance

Fechar a jornada que já consegue revisar e publicar o segundo cronograma, liberar a competição, registrar os cinco resultados e mostrar o campeão na árvore. Depois da final, os indicadores, o histórico e o tempo devem concordar para administrador e mesário; o comando **Sair** deve encerrar de fato a sessão. Cobrir a repetição do ciclo e as fronteiras de autorização com testes permanentes.

O [plano do segundo ciclo](../plano-segundo-ciclo-cronograma-luna-2026-09-23/README.md) e seu [STATUS](../plano-segundo-ciclo-cronograma-luna-2026-09-23/STATUS.md) já registram a correção anterior e um gate automatizado verde. Este pacote trata os defeitos posteriores revelados pela homologação manual. Não repetir nem desmanchar aquele trabalho; uma aprovação anterior não comprova os novos aceites.

## Premissas e decisões de escopo

- A implantação será nova e sem dados. Não criar compatibilidade com versões antigas, aliases ou migração de formatos legados. Dados, revisão vigente e fila offline produzidos pela **versão atual** ainda precisam permanecer consistentes durante a jornada e entre sessões.
- A troca de senha foi excluída do teste visual por instrução do usuário e continua fora deste aceite. Primeiro acesso e autoinscrição do aluno também não foram exercidos pela homologação; não alegar cobertura desses percursos a partir dos prints.
- O bye e o avanço direto observados com seis equipes são uma **questão de regra a verificar**, não um erro esportivo comprovado. Registrar o pareamento esperado a partir do contrato atual antes de propor alteração de chave.
- Não mudar schema por presunção. Se a definição de duração ou uma consulta de histórico exigir persistência nova, justificar no [diagnóstico](00-diagnostico.md) e adicionar migração numerada, instalação vazia e testes em MariaDB/MySQL.
- Preservar todas as alterações preexistentes do checkout. Não fazer push, merge ou deploy como parte da execução deste plano.

## Como executar

1. Ler [diagnóstico](00-diagnostico.md) e reproduzir as requisições/respostas do navegador antes de editar. Conferir também `AGENTS.md`, [arquitetura](../architecture.md) e [testes](../testing.md).
2. Fixar o [contrato](01-contrato.md); implementar as [etapas S00–S06](02-etapas.md), com regressões que falhem no comportamento antigo quando viável.
3. Aplicar a [matriz de validação](03-validacao.md), inclusive a jornada de navegador e o gate completo. Registrar somente resultados observados em [STATUS](STATUS.md).
4. O [prompt para Luna](PROMPT-LUNA.md) resume a execução no mesmo checkout; ele não solicita abrir outra tarefa.

Entrega realizada: fonte e testes nos runners oficiais; jornada de cinco partidas com seis equipes simulada no navegador; capturas do histórico de administrador e mesário; e STATUS atualizado com run ID, comando, resultados, logs e limites. O gate final `20260924_120610_9da6c5` passou em MariaDB 10.11 e PHP 8.4. Nenhuma migração foi necessária, não foi criada compatibilidade legada e a regra vigente do bye foi mantida após validar o percurso de seis equipes.
