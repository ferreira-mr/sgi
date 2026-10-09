-- Planejamento de cronograma anterior às inscrições.
-- ADD COLUMN IF NOT EXISTS mantém a migration segura quando o baseline já
-- contém a estrutura atualizada para instalações novas.
CREATE TABLE IF NOT EXISTS interclasse_planejamentos (
  id_interclasse INT NOT NULL PRIMARY KEY,
  cronograma_status ENUM('rascunho','publicado','revisao') NOT NULL DEFAULT 'rascunho',
  inscricoes_status ENUM('fechadas','abertas','encerradas') NOT NULL DEFAULT 'fechadas',
  cronograma_versao INT UNSIGNED NOT NULL DEFAULT 0,
  inscricoes_abertura DATETIME NULL,
  inscricoes_encerramento DATETIME NULL,
  CONSTRAINT fk_planejamento_interclasse FOREIGN KEY (id_interclasse) REFERENCES interclasses (id_interclasse) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS modalidade_planejamentos (
  id_modalidade INT NOT NULL PRIMARY KEY,
  equipes_planejadas INT NOT NULL,
  min_inscritos_equipe INT NOT NULL DEFAULT 1,
  max_inscritos_equipe INT NOT NULL DEFAULT 1,
  formato_participacao ENUM('equipe','dupla','individual') NOT NULL DEFAULT 'equipe',
  duracao_prevista_min SMALLINT UNSIGNED NULL,
  descanso_min SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_planejamento_modalidade FOREIGN KEY (id_modalidade) REFERENCES modalidades (id_modalidade) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS equipe_planejamentos (
  id_equipe INT NOT NULL PRIMARY KEY,
  ordem_planejada INT UNSIGNED NOT NULL,
  planejada TINYINT(1) NOT NULL DEFAULT 1,
  min_inscritos INT UNSIGNED NOT NULL DEFAULT 1,
  max_inscritos INT UNSIGNED NOT NULL DEFAULT 1,
  CONSTRAINT fk_planejamento_equipe FOREIGN KEY (id_equipe) REFERENCES equipes (id_equipe) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS cronograma_compromissos (
  id_compromisso INT NOT NULL AUTO_INCREMENT,
  id_interclasse INT NOT NULL,
  id_modalidade INT NOT NULL,
  id_equipe INT NULL,
  id_reserva INT NULL,
  chave_tag VARCHAR(80) NOT NULL,
  data_compromisso DATE NOT NULL,
  inicio_compromisso TIME NOT NULL,
  termino_compromisso TIME NOT NULL,
  id_local INT NOT NULL,
  condicional TINYINT(1) NOT NULL DEFAULT 1,
  cronograma_versao INT UNSIGNED NOT NULL,
  PRIMARY KEY (id_compromisso),
  UNIQUE KEY uk_cronograma_compromisso (id_interclasse,id_modalidade,cronograma_versao,chave_tag,id_equipe),
  KEY idx_cronograma_compromisso_equipe (id_equipe,data_compromisso,inicio_compromisso),
  CONSTRAINT fk_compromisso_interclasse FOREIGN KEY (id_interclasse) REFERENCES interclasses (id_interclasse) ON DELETE CASCADE,
  CONSTRAINT fk_compromisso_modalidade FOREIGN KEY (id_modalidade) REFERENCES modalidades (id_modalidade) ON DELETE CASCADE,
  CONSTRAINT fk_compromisso_equipe FOREIGN KEY (id_equipe) REFERENCES equipes (id_equipe) ON DELETE SET NULL,
  CONSTRAINT fk_compromisso_local FOREIGN KEY (id_local) REFERENCES locais (id_local) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
