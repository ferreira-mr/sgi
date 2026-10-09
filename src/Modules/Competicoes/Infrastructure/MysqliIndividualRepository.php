<?php

declare (strict_types=1);

namespace App\Modules\Competicoes\Infrastructure;

use App\Modules\Resultados\Domain\PodioRules;
use App\Modules\Resultados\Infrastructure\MysqliPodioRepository;

final class MysqliIndividualRepository
{
    /**
     * Engine para modalidades individuais (corrida, natação, etc.)
     *
     * O admin seleciona participantes e registra 1º, 2º e 3º lugar.
     * Cada participante é um registro na tabela `partidas` com resultado_partida = posição (1, 2 ou 3).
     * Um "jogo" especial é criado com nome_jogo = "IND:{id_modalidade}" para agrupar o ranking.
     */
    /**
     * Busca o primeiro local ativo disponível.
     */
    public static function resolverIdLocal(\mysqli $conn): int
    {
        $q = $conn->query("SELECT id_local FROM locais WHERE status_local = '1' ORDER BY id_local ASC LIMIT 1");
        if ($q && $r = $q->fetch_assoc()) {
            return (int) $r['id_local'];
        }
        $q2 = $conn->query('SELECT id_local FROM locais ORDER BY id_local ASC LIMIT 1');
        if ($q2 && $r2 = $q2->fetch_assoc()) {
            return (int) $r2['id_local'];
        }
        return 1;
    }
    /**
     * Busca participantes disponíveis para uma modalidade individual.
     * Retorna alunos que são competidores e estão vinculados a equipes dessa modalidade.
     *
     * @return list<array{id_usuario:int, nome_usuario:string, nome_turma:string, nome_fantasia_turma:string, genero_usuario:string, id_equipe:int}>
     */
    public static function buscarParticipantes(\mysqli $conn, int $idModalidade): array
    {
        $sql = 'SELECT DISTINCT u.id_usuario, u.nome_usuario, u.genero_usuario,
                   t.id_turma, t.nome_turma, t.nome_fantasia_turma,
                   e.id_equipe
            FROM usuarios u
            INNER JOIN equipes_has_usuarios ehu ON ehu.usuarios_id_usuario = u.id_usuario
            INNER JOIN equipes e ON e.id_equipe = ehu.equipes_id_equipe
            INNER JOIN turmas t ON t.id_turma = e.turmas_id_turma
            INNER JOIN modalidades m ON m.id_modalidade = e.modalidades_id_modalidade
            WHERE e.modalidades_id_modalidade = ?
              AND e.status_equipe = \'1\'
              AND u.status_usuario = \'1\'
              AND u.nivel_usuario = \'3\'
              AND u.turmas_id_turma = t.id_turma
              AND t.interclasses_id_interclasse = m.interclasses_id_interclasse
              AND u.interclasses_id_interclasse = m.interclasses_id_interclasse
            ORDER BY t.nome_turma, u.nome_usuario, e.id_equipe';
        $st = $conn->prepare($sql);
        if (!$st) {
            throw new \RuntimeException($conn->error);
        }
        $st->bind_param('i', $idModalidade);
        $st->execute();
        $rows = $st->get_result()->fetch_all(\MYSQLI_ASSOC);
        $st->close();
        return \array_map(static fn (array $r): array => ['id_usuario' => (int) $r['id_usuario'], 'nome_usuario' => $r['nome_usuario'], 'genero_usuario' => $r['genero_usuario'], 'id_turma' => (int) $r['id_turma'], 'nome_turma' => $r['nome_turma'], 'nome_fantasia_turma' => $r['nome_fantasia_turma'], 'id_equipe' => (int) $r['id_equipe']], $rows);
    }
    /**
     * Busca o jogo de ranking existente para uma modalidade individual.
     *
     * @return array{id_jogo:int, status_jogo:string}|null
     */
    public static function buscarJogoExistente(\mysqli $conn, int $idModalidade, ?int $idJogo = null): ?array
    {
        $row = null;
        if ($idJogo !== null && $idJogo > 0) {
            $st = $conn->prepare('SELECT id_jogo, status_jogo, nome_jogo, modalidades_id_modalidade FROM jogos WHERE id_jogo = ? AND modalidades_id_modalidade = ? LIMIT 1 FOR UPDATE');
            if (!$st) {
                throw new \RuntimeException($conn->error);
            }
            $st->bind_param('ii', $idJogo, $idModalidade);
            $st->execute();
            $row = $st->get_result()->fetch_assoc() ?: null;
            $st->close();
        } else {
            $tag = \App\Modules\Competicoes\Domain\IndividualRules::tag($idModalidade);
            // A tag é a identidade canônica da prova. Não escolher o primeiro
            // registro quando uma instalação antiga possui duas provas com a
            // mesma tag: isso esconderia a ambiguidade e poderia creditar o
            // pódio no jogo errado.
            $st = $conn->prepare('SELECT id_jogo, status_jogo, nome_jogo, modalidades_id_modalidade FROM jogos WHERE modalidades_id_modalidade = ? AND nome_jogo = ? ORDER BY id_jogo ASC FOR UPDATE');
            if (!$st) {
                throw new \RuntimeException($conn->error);
            }
            $st->bind_param('is', $idModalidade, $tag);
            $st->execute();
            $tagRows = $st->get_result()->fetch_all(\MYSQLI_ASSOC);
            $st->close();
            if (count($tagRows) > 1) {
                throw new \RuntimeException('Há mais de uma prova individual com a mesma identidade; faça a auditoria antes de registrar o ranking.');
            }
            $row = $tagRows[0] ?? null;
            if ($row !== null) {
                return ['id_jogo' => (int) $row['id_jogo'], 'status_jogo' => $row['status_jogo'], 'nome_jogo' => (string) $row['nome_jogo'], 'modalidades_id_modalidade' => (int) $row['modalidades_id_modalidade']];
            }
            // Sem a tag oficial, um único registro legado pode ser exposto
            // para diagnóstico/leitura. Os caminhos de preparação e gravação
            // validam a identidade antes de aceitar qualquer alteração.
            $st = $conn->prepare('SELECT id_jogo, status_jogo, nome_jogo, modalidades_id_modalidade FROM jogos WHERE modalidades_id_modalidade = ? ORDER BY id_jogo ASC FOR UPDATE');
            if (!$st) {
                throw new \RuntimeException($conn->error);
            }
            $st->bind_param('i', $idModalidade);
            $st->execute();
            $rows = $st->get_result()->fetch_all(\MYSQLI_ASSOC);
            $st->close();
            if (count($rows) > 1) {
                throw new \RuntimeException('Há mais de um jogo para esta prova individual; faça a auditoria antes de registrar o ranking.');
            }
            $row = $rows[0] ?? null;
        }
        return $row ? ['id_jogo' => (int) $row['id_jogo'], 'status_jogo' => $row['status_jogo'], 'nome_jogo' => (string) $row['nome_jogo'], 'modalidades_id_modalidade' => (int) $row['modalidades_id_modalidade']] : \null;
    }
    /**
     * Cria o jogo de ranking para uma modalidade individual.
     */
    public static function criarJogo(\mysqli $conn, int $idModalidade): int
    {
        $tag = \App\Modules\Competicoes\Domain\IndividualRules::tag($idModalidade);
        $st = $conn->prepare("INSERT INTO jogos (nome_jogo, data_jogo, inicio_jogo, termino_jogo, status_jogo, modalidades_id_modalidade, locais_id_local)\r\n         VALUES (?, NULL, NULL, NULL, 'Agendado', ?, NULL)");
        $st->bind_param('si', $tag, $idModalidade);
        $st->execute();
        $idJogo = (int) $conn->insert_id;
        $st->close();
        MysqliChaveamentoRepository::aplicarReservaAgenda($conn, $idModalidade, $tag, $idJogo);
        return $idJogo;
    }
    /**
     * Salva o ranking (1º, 2º, 3º lugar) para uma modalidade individual.
     * Na primeira finalização do jogo, soma os pontos (ponto_1/2/3_lugar do interclasse)
     * na `pontuacao_turma` das turmas dos 3 colocados.
     *
     * @param array{primeiro:int, segundo:int, terceiro:int} $ranking IDs dos usuários
     */
    public static function salvarRanking(\mysqli $conn, int $idModalidade, array $ranking, ?int $idJogo = null): array
    {
        self::bloquearModalidadeIndividual($conn, $idModalidade);
        // Validações
        if (empty($ranking['primeiro']) || empty($ranking['segundo']) || empty($ranking['terceiro'])) {
            throw new \RuntimeException('É necessário informar o 1º, 2º e 3º lugar.');
        }
        // Verifica se os participantes são válidos
        $participantes = \App\Modules\Competicoes\Infrastructure\MysqliIndividualRepository::buscarParticipantes($conn, $idModalidade);
        $participantesPorId = [];
        foreach ($participantes as $participante) {
            $idParticipante = (int) $participante['id_usuario'];
            if (isset($participantesPorId[$idParticipante])
                && (int) $participantesPorId[$idParticipante]['id_equipe'] !== (int) $participante['id_equipe']) {
                throw new \RuntimeException('O estudante possui vínculos conflitantes nesta modalidade.');
            }
            $participantesPorId[$idParticipante] = $participante;
        }
        $idsValidos = \array_keys($participantesPorId);
        foreach (['primeiro', 'segundo', 'terceiro'] as $posicao) {
            if (!\in_array($ranking[$posicao], $idsValidos, \true)) {
                throw new \RuntimeException("O participante do {$posicao} lugar não é válido para esta modalidade.");
            }
        }
        // Verifica duplicados
        $idsUnicos = \array_unique([$ranking['primeiro'], $ranking['segundo'], $ranking['terceiro']]);
        if (\count($idsUnicos) !== 3) {
            throw new \RuntimeException('Os participantes do 1º, 2º e 3º lugar devem ser diferentes.');
        }
        $posicoes = [1 => (int) $ranking['primeiro'], 2 => (int) $ranking['segundo'], 3 => (int) $ranking['terceiro']];
        $equipesPorPosicao = [];
        foreach ($posicoes as $posicao => $idUsuario) {
            $equipe = isset($participantesPorId[$idUsuario]) ? (int) $participantesPorId[$idUsuario]['id_equipe'] : null;
            if ($equipe === null || $equipe <= 0) {
                throw new \RuntimeException("Usuário {$idUsuario} não possui equipe nesta modalidade.");
            }
            $equipesPorPosicao[$posicao] = $equipe;
        }
        // Busca ou cria o jogo
        $jogo = \App\Modules\Competicoes\Infrastructure\MysqliIndividualRepository::buscarJogoExistente($conn, $idModalidade, $idJogo);
        $creditosAnteriores = null;
        if ($jogo === \null) {
            throw new \RuntimeException('Prepare o jogo da modalidade individual antes de registrar o ranking.');
        } else {
            self::validarIdentidadeJogo($jogo, $idModalidade);
            $idJogo = $jogo['id_jogo'];
            $jaConcluido = $jogo['status_jogo'] === 'Concluido' || $jogo['status_jogo'] === 'Finalizado';
            if (!$jaConcluido && !in_array($jogo['status_jogo'], ['Iniciado', 'Pausado'], true)) {
                throw new \RuntimeException('Inicie o jogo da modalidade individual antes de registrar o ranking.');
            }
            $editionStatement = $conn->prepare('SELECT interclasses_id_interclasse FROM modalidades WHERE id_modalidade = ? LIMIT 1');
            $editionStatement->bind_param('i', $idModalidade);
            $editionStatement->execute();
            $editionId = (int) $editionStatement->get_result()->fetch_column();
            $editionStatement->close();
            if ($editionId <= 0) {
                throw new \RuntimeException('Modalidade sem edição para reconciliação individual.');
            }
            $creditosAnteriores = (new MysqliPodioRepository($conn))->carregarBloqueados($editionId, $idModalidade);
            if ($jaConcluido && \count(\array_filter($creditosAnteriores, static fn (array $credito): bool => (int) ($credito['posicao'] ?? 0) <= 3)) < 3) {
                throw new \RuntimeException('Pódio individual sem origem atual não pode ser retificado.');
            }
            // Limpa partidas existentes
            \App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository::desvincularHistoricoDasPartidas($conn, $idJogo);
            $stDel = $conn->prepare('DELETE FROM partidas WHERE jogos_id_jogo = ?');
            $stDel->bind_param('i', $idJogo);
            $stDel->execute();
            $stDel->close();
        }
        // Insere as 3 posições
        $stIns = $conn->prepare("INSERT INTO partidas (jogos_id_jogo, equipes_id_equipe, usuarios_id_usuario, resultado_partida, status_partida)\r\n         VALUES (?, ?, ?, ?, '1')");
        foreach ($posicoes as $posicao => $idUsuario) {
            $equipe = $equipesPorPosicao[$posicao];
            $stIns->bind_param('iiii', $idJogo, $equipe, $idUsuario, $posicao);
            $stIns->execute();
        }
        $stIns->close();
        // O crédito de pódio é uma fonte própria e só é aplicado como diferença.
        self::registrarCreditoPodio($conn, $idModalidade, $idJogo, $equipesPorPosicao, $posicoes, $jaConcluido, $creditosAnteriores);
        // Atualiza status do jogo para Concluído
        $stUpd = $conn->prepare("UPDATE jogos SET status_jogo = 'Concluido' WHERE id_jogo = ?");
        $stUpd->bind_param('i', $idJogo);
        $stUpd->execute();
        $stUpd->close();
        return ['success' => \true, 'message' => 'Ranking registrado com sucesso.', 'id_jogo' => $idJogo];
    }
    /**
     * Soma os pontos dos 3 colocados à pontuação das turmas no ranking geral.
     * Aplica os créditos de pódio somente na primeira finalização.
     *
     * @param array{1:int, 2:int, 3:int} $equipesPorPosicao id_equipe de cada posição
     */
    public static function aplicarPontos(\mysqli $conn, int $idModalidade, array $equipesPorPosicao): void
    {
        $jogo = self::buscarJogoExistente($conn, $idModalidade);
        if ($jogo !== null) {
            self::registrarCreditoPodio($conn, $idModalidade, (int) $jogo['id_jogo'], $equipesPorPosicao, [], false);
        }
    }

    /**
     * @param array<int, int> $equipesPorPosicao
     * @param array<int, int> $usuariosPorPosicao
     */
    /** @param list<array<string, mixed>>|null $creditosAnteriores */
    private static function registrarCreditoPodio(\mysqli $conn, int $idModalidade, int $idJogo, array $equipesPorPosicao, array $usuariosPorPosicao, bool $jaConcluido, ?array $creditosAnteriores = null): void
    {
        $modality = $conn->prepare('SELECT interclasses_id_interclasse FROM modalidades WHERE id_modalidade = ? LIMIT 1');
        $modality->bind_param('i', $idModalidade);
        $modality->execute();
        $editionId = (int) $modality->get_result()->fetch_column();
        $modality->close();
        if ($editionId <= 0) {
            throw new \RuntimeException('Modalidade sem edição para crédito de pódio.');
        }
        $repository = new MysqliPodioRepository($conn);
        $old = $creditosAnteriores ?? $repository->carregarBloqueados($editionId, $idModalidade);
        $oldByPosition = [];
        foreach ($old as $credit) {
            if ((int) $credit['posicao'] <= 3) {
                $oldByPosition[(int) $credit['posicao']] = $credit;
            }
        }
        if ($jaConcluido && count($oldByPosition) < 3) {
            throw new \RuntimeException('Pódio individual sem origem atual não pode ser retificado.');
        }
        $pointsStatement = $conn->prepare('SELECT ponto_1_lugar, ponto_2_lugar, ponto_3_lugar FROM interclasses WHERE id_interclasse = ? LIMIT 1');
        $pointsStatement->bind_param('i', $editionId);
        $pointsStatement->execute();
        $points = $pointsStatement->get_result()->fetch_assoc() ?: [];
        $pointsStatement->close();
        $new = [];
        foreach ([1, 2, 3] as $position) {
            $teamId = (int) ($equipesPorPosicao[$position] ?? 0);
            $classId = $repository->turmaDaEquipe($teamId, $idModalidade);
            if ($teamId <= 0 || $classId === null) {
                throw new \RuntimeException('Participante sem turma para crédito de pódio.');
            }
            $existing = $oldByPosition[$position] ?? null;
            $new[] = [
                'posicao' => $position,
                'id_turma' => $classId,
                'id_equipe' => $teamId,
                'id_usuario' => $usuariosPorPosicao[$position] ?? null,
                'id_jogo' => $idJogo,
                'pontos' => $existing !== null ? (int) $existing['pontos'] : (int) ($points['ponto_' . $position . '_lugar'] ?? 0),
                'ativo' => 1,
                'origem_registro' => $existing !== null ? (string) $existing['origem_registro'] : 'novo',
            ];
        }
        $deltas = PodioRules::deltas($old, $new);
        $repository->substituirPosicoes($editionId, $idModalidade, $new);
        $repository->aplicarDeltas($deltas);
    }
    /**
     * Busca a equipe de um usuário para uma modalidade específica.
     */
    public static function buscarEquipeUsuario(\mysqli $conn, int $idUsuario, int $idModalidade): ?int
    {
        $st = $conn->prepare('SELECT e.id_equipe
         FROM equipes e
         INNER JOIN equipes_has_usuarios ehu ON ehu.equipes_id_equipe = e.id_equipe
         WHERE ehu.usuarios_id_usuario = ?
           AND e.modalidades_id_modalidade = ?
           AND e.status_equipe = \'1\'
         LIMIT 1');
        $st->bind_param('ii', $idUsuario, $idModalidade);
        $st->execute();
        $row = $st->get_result()->fetch_assoc();
        $st->close();
        return $row ? (int) $row['id_equipe'] : \null;
    }
    /**
     * Monta JSON com o ranking de uma modalidade individual para o frontend.
     *
     * @return array{success:bool, ranking:list<array{posicao:int, id_usuario:int, nome_usuario:string, nome_turma:string, nome_fantasia_turma:string}>, jogo:array|null}
     */
    public static function montarJsonRanking(\mysqli $conn, int $idModalidade): array
    {
        $jogo = \App\Modules\Competicoes\Infrastructure\MysqliIndividualRepository::buscarJogoExistente($conn, $idModalidade);
        if ($jogo === \null) {
            return ['success' => \true, 'ranking' => [], 'jogo' => \null];
        }
        $sql = 'SELECT p.resultado_partida, p.equipes_id_equipe,
                   u.id_usuario, u.nome_usuario,
                   t.nome_turma, t.nome_fantasia_turma
            FROM partidas p
            INNER JOIN usuarios u ON u.id_usuario = p.usuarios_id_usuario
            INNER JOIN equipes e ON e.id_equipe = p.equipes_id_equipe
            INNER JOIN turmas t ON t.id_turma = e.turmas_id_turma
            WHERE p.jogos_id_jogo = ?
              AND p.resultado_partida BETWEEN 1 AND 3
            ORDER BY p.resultado_partida ASC';
        $st = $conn->prepare($sql);
        $st->bind_param('i', $jogo['id_jogo']);
        $st->execute();
        $rows = $st->get_result()->fetch_all(\MYSQLI_ASSOC);
        $st->close();
        $ranking = [];
        foreach ($rows as $row) {
            $ranking[] = ['posicao' => (int) $row['resultado_partida'], 'id_usuario' => (int) $row['id_usuario'], 'nome_usuario' => $row['nome_usuario'], 'nome_turma' => $row['nome_turma'], 'nome_fantasia_turma' => $row['nome_fantasia_turma']];
        }
        $stJ = $conn->prepare('SELECT j.id_jogo, j.nome_jogo, j.data_jogo, j.inicio_jogo, j.termino_jogo,
                j.status_jogo, j.locais_id_local, j.modalidades_id_modalidade,
                m.nome_modalidade, m.tipos_modalidades_id_tipo_modalidade,
                tm.nome_tipo_modalidade
         FROM jogos j
         LEFT JOIN modalidades m ON m.id_modalidade = j.modalidades_id_modalidade
         LEFT JOIN tipos_modalidades tm ON tm.id_tipo_modalidade = m.tipos_modalidades_id_tipo_modalidade
         WHERE j.id_jogo = ? LIMIT 1');
        $stJ->bind_param('i', $jogo['id_jogo']);
        $stJ->execute();
        $jogoDetalhes = $stJ->get_result()->fetch_assoc();
        $stJ->close();
        return ['success' => \true, 'ranking' => $ranking, 'jogo' => $jogoDetalhes ? [
            'id_jogo' => (int) $jogoDetalhes['id_jogo'],
            'nome_jogo' => $jogoDetalhes['nome_jogo'],
            'data_jogo' => $jogoDetalhes['data_jogo'],
            'inicio_jogo' => $jogoDetalhes['inicio_jogo'],
            'termino_jogo' => $jogoDetalhes['termino_jogo'],
            'status_jogo' => $jogoDetalhes['status_jogo'],
            'locais_id_local' => $jogoDetalhes['locais_id_local'],
            'nome_modalidade' => $jogoDetalhes['nome_modalidade'],
            'tipos_modalidades_id_tipo_modalidade' => (int) $jogoDetalhes['tipos_modalidades_id_tipo_modalidade'],
            'nome_tipo_modalidade' => $jogoDetalhes['nome_tipo_modalidade'],
            'tipo_competicao' => \App\Modules\Competicoes\Domain\TipoCompeticaoRules::resolve($jogoDetalhes),
        ] : \null];
    }
    /**
     * Cria ou atualiza o jogo da modalidade individual para exibição na Agenda.
     * Vincula todas as equipes ativas dessa modalidade ao jogo na tabela `partidas`.
     *
     * @return array{success:bool, message:string, id_jogo:int, jogos_criados:int}
     */
    public static function criarJogoAgenda(\mysqli $conn, int $idModalidade): array
    {
        self::bloquearModalidadeIndividual($conn, $idModalidade);
        // Um jogo já concluído é imutável para a preparação da agenda. A
        // consulta vem antes das equipes para que a operação continue
        // idempotente mesmo se as equipes tiverem sido desativadas depois do
        // encerramento.
        $jogo = \App\Modules\Competicoes\Infrastructure\MysqliIndividualRepository::buscarJogoExistente($conn, $idModalidade);
        if ($jogo !== null) {
            self::validarIdentidadeJogo($jogo, $idModalidade);
        }
        if ($jogo !== null && in_array($jogo['status_jogo'], ['Concluido', 'Finalizado'], true)) {
            return ['success' => \true, 'message' => 'O jogo individual já foi concluído e permanece disponível na agenda.', 'id_jogo' => $jogo['id_jogo'], 'jogos_criados' => 0];
        }
        // Buscar equipes ativas desta modalidade
        $stEq = $conn->prepare("SELECT id_equipe FROM equipes WHERE modalidades_id_modalidade = ? AND status_equipe = '1'");
        if (!$stEq) {
            throw new \RuntimeException($conn->error);
        }
        $stEq->bind_param('i', $idModalidade);
        $stEq->execute();
        $rowsEq = $stEq->get_result()->fetch_all(\MYSQLI_ASSOC);
        $stEq->close();
        if (empty($rowsEq)) {
            throw new \RuntimeException('É necessário ao menos uma equipe ativa cadastrada nesta modalidade.');
        }
        $equipeIds = \array_map(static fn (array $r): int => (int) $r['id_equipe'], $rowsEq);
        // Buscar ou criar o jogo de tag IND:{idModalidade}
        if ($jogo === \null) {
            $idJogo = \App\Modules\Competicoes\Infrastructure\MysqliIndividualRepository::criarJogo($conn, $idModalidade);
        } else {
            $idJogo = $jogo['id_jogo'];
        }
        // Buscar equipes já vinculadas em partidas deste jogo
        $stP = $conn->prepare('SELECT DISTINCT equipes_id_equipe FROM partidas WHERE jogos_id_jogo = ?');
        $stP->bind_param('i', $idJogo);
        $stP->execute();
        $rowsPart = $stP->get_result()->fetch_all(\MYSQLI_ASSOC);
        $stP->close();
        $equipesExistentes = \array_map(static fn (array $r): int => (int) $r['equipes_id_equipe'], $rowsPart);
        $stIns = $conn->prepare("INSERT INTO partidas (jogos_id_jogo, equipes_id_equipe, resultado_partida, status_partida) VALUES (?, ?, 0, '1')");
        foreach ($equipeIds as $idEquipe) {
            if (!\in_array($idEquipe, $equipesExistentes, \true)) {
                $stIns->bind_param('ii', $idJogo, $idEquipe);
                $stIns->execute();
            }
        }
        $stIns->close();
        return ['success' => \true, 'message' => 'Jogo de modalidade individual gerado para a agenda.', 'id_jogo' => $idJogo, 'jogos_criados' => 1];
    }

    private static function bloquearModalidadeIndividual(\mysqli $conn, int $idModalidade): void
    {
        $st = $conn->prepare('SELECT m.tipos_modalidades_id_tipo_modalidade, tm.nome_tipo_modalidade FROM modalidades m LEFT JOIN tipos_modalidades tm ON tm.id_tipo_modalidade = m.tipos_modalidades_id_tipo_modalidade WHERE m.id_modalidade = ? LIMIT 1 FOR UPDATE');
        if (!$st) {
            throw new \RuntimeException($conn->error);
        }
        $st->bind_param('i', $idModalidade);
        $st->execute();
        $modality = $st->get_result()->fetch_assoc() ?: null;
        $st->close();
        if ($modality === null) {
            throw new \RuntimeException('Modalidade não encontrada.');
        }
        if (!\App\Modules\Competicoes\Domain\TipoCompeticaoRules::isIndividual($modality)) {
            throw new \RuntimeException('A modalidade informada não é individual.');
        }
    }

    /** @param array<string,mixed> $jogo */
    private static function validarIdentidadeJogo(array $jogo, int $idModalidade): void
    {
        $esperada = \App\Modules\Competicoes\Domain\IndividualRules::tag($idModalidade);
        if ((string) ($jogo['nome_jogo'] ?? '') !== $esperada) {
            throw new \RuntimeException('A prova individual encontrada tem identidade incompatível; faça a auditoria antes de registrar o ranking.');
        }
    }
}
