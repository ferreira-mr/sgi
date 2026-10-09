-- Nós persistidos do chaveamento planejado. A árvore fica separada de jogos
-- reais para que BYEs e dependências possam existir antes das inscrições.
CREATE TABLE IF NOT EXISTS cronograma_nos (
  id_no INT NOT NULL AUTO_INCREMENT,
  id_interclasse INT NOT NULL,
  id_modalidade INT NOT NULL,
  id_turma INT NOT NULL,
  chave_tag VARCHAR(80) NOT NULL,
  tipo_no ENUM('normal','bye','individual') NOT NULL,
  fase_largura INT UNSIGNED NOT NULL,
  slot INT UNSIGNED NOT NULL,
  origem_a_tag VARCHAR(80) NULL,
  origem_b_tag VARCHAR(80) NULL,
  id_equipe_a INT NULL,
  id_equipe_b INT NULL,
  cronograma_versao INT UNSIGNED NOT NULL,
  PRIMARY KEY (id_no),
  UNIQUE KEY uk_cronograma_no (id_interclasse,id_modalidade,id_turma,cronograma_versao,chave_tag),
  KEY idx_cronograma_no_tag (id_interclasse,cronograma_versao,chave_tag),
  CONSTRAINT fk_no_interclasse FOREIGN KEY (id_interclasse) REFERENCES interclasses (id_interclasse) ON DELETE CASCADE,
  CONSTRAINT fk_no_modalidade FOREIGN KEY (id_modalidade) REFERENCES modalidades (id_modalidade) ON DELETE CASCADE,
  CONSTRAINT fk_no_turma FOREIGN KEY (id_turma) REFERENCES turmas (id_turma) ON DELETE CASCADE,
  CONSTRAINT fk_no_equipe_a FOREIGN KEY (id_equipe_a) REFERENCES equipes (id_equipe) ON DELETE SET NULL,
  CONSTRAINT fk_no_equipe_b FOREIGN KEY (id_equipe_b) REFERENCES equipes (id_equipe) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS cronograma_no_equipes (
  id_no INT NOT NULL,
  id_equipe INT NOT NULL,
  lado ENUM('a','b','candidato') NOT NULL DEFAULT 'candidato',
  PRIMARY KEY (id_no,id_equipe),
  KEY idx_no_equipe (id_equipe),
  CONSTRAINT fk_no_equipe_no FOREIGN KEY (id_no) REFERENCES cronograma_nos (id_no) ON DELETE CASCADE,
  CONSTRAINT fk_no_equipe_equipe FOREIGN KEY (id_equipe) REFERENCES equipes (id_equipe) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
