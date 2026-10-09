-- Vínculo canônico entre a árvore publicada e a partida operacional.
-- A ligação é anulada se uma partida legada for removida, sem apagar o plano.
ALTER TABLE cronograma_nos
  ADD COLUMN id_jogo INT NULL AFTER id_no,
  ADD UNIQUE KEY uk_cronograma_no_jogo (id_jogo),
  ADD CONSTRAINT fk_cronograma_no_jogo FOREIGN KEY (id_jogo)
    REFERENCES jogos (id_jogo) ON DELETE SET NULL;

-- Reaproveita somente correspondências únicas da versão publicada atual.
-- Tags antigas ou duplicadas permanecem sem vínculo para revisão explícita.
UPDATE cronograma_nos cn
INNER JOIN interclasse_planejamentos ip
  ON ip.id_interclasse = cn.id_interclasse
 AND ip.versao_publicada = cn.cronograma_versao
INNER JOIN jogos j
  ON j.modalidades_id_modalidade = cn.id_modalidade
 AND j.nome_jogo = cn.chave_tag
SET cn.id_jogo = j.id_jogo
WHERE (
  SELECT COUNT(*)
  FROM jogos j2
  WHERE j2.modalidades_id_modalidade = cn.id_modalidade
    AND j2.nome_jogo = cn.chave_tag
) = 1;
