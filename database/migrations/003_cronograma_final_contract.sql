-- Contrato único do cronograma atual: árvores podem atravessar turmas da
-- mesma categoria e a versão publicada fica separada da revisão em edição.
ALTER TABLE cronograma_nos
  MODIFY id_turma INT NULL;

ALTER TABLE interclasse_planejamentos
  ADD COLUMN versao_publicada INT UNSIGNED NULL AFTER cronograma_versao,
  ADD COLUMN operacao_liberada TINYINT(1) NOT NULL DEFAULT 0 AFTER versao_publicada;

INSERT INTO interclasse_planejamentos (id_interclasse, cronograma_status, inscricoes_status)
SELECT i.id_interclasse, 'rascunho', 'fechadas'
FROM interclasses i
LEFT JOIN interclasse_planejamentos p ON p.id_interclasse = i.id_interclasse
WHERE p.id_interclasse IS NULL;
