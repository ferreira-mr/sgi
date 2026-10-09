<?php

declare(strict_types=1);

namespace App\Modules\Competicoes\Infrastructure;

use App\Modules\Competicoes\Domain\CronogramaRepository;
use App\Modules\Competicoes\Domain\CronogramaBracketPlanner;
use App\Modules\Competicoes\Domain\CronogramaRules;
use App\Modules\Competicoes\Domain\ChaveamentoRules;
use App\Shared\Database\Transaction;
use InvalidArgumentException;
use mysqli;
use RuntimeException;

final class MysqliCronogramaRepository implements CronogramaRepository
{
    public function __construct(private readonly mysqli $connection)
    {
    }

    public function state(int $editionId): array
    {
        $edition = $this->one('SELECT i.id_interclasse, p.cronograma_status, p.inscricoes_status, p.cronograma_versao, p.versao_publicada, p.operacao_liberada, p.inscricoes_abertura, p.inscricoes_encerramento FROM interclasses i INNER JOIN interclasse_planejamentos p ON p.id_interclasse = i.id_interclasse WHERE i.id_interclasse = ? LIMIT 1', 'i', [$editionId]);
        if ($edition === null) {
            throw new InvalidArgumentException('Edição não encontrada.');
        }
        $modalities = $this->all('SELECT m.id_modalidade, m.nome_modalidade, m.categorias_id_categoria, mp.equipes_planejadas, mp.min_inscritos_equipe, mp.max_inscritos_equipe, mp.formato_participacao, mp.duracao_prevista_min, mp.descanso_min, (SELECT COUNT(*) FROM equipes e WHERE e.modalidades_id_modalidade = m.id_modalidade AND e.status_equipe = \'1\') AS equipes_criadas FROM modalidades m LEFT JOIN modalidade_planejamentos mp ON mp.id_modalidade = m.id_modalidade WHERE m.interclasses_id_interclasse = ? AND m.status_modalidade = \'1\' ORDER BY m.id_modalidade', 'i', [$editionId]);
        $publishedVersion = $edition['versao_publicada'] === null
            ? (int) $edition['cronograma_versao']
            : (int) $edition['versao_publicada'];
        $commitments = $this->all('SELECT cc.id_compromisso, cc.id_modalidade, m.nome_modalidade, cc.id_equipe, cc.chave_tag, DATE_FORMAT(cc.data_compromisso, \'%Y-%m-%d\') AS data_compromisso, TIME_FORMAT(cc.inicio_compromisso, \'%H:%i:%s\') AS inicio_compromisso, TIME_FORMAT(cc.termino_compromisso, \'%H:%i:%s\') AS termino_compromisso, cc.id_local, COALESCE(l.nome_local, \'A definir\') AS nome_local, cc.condicional, cc.cronograma_versao FROM cronograma_compromissos cc INNER JOIN modalidades m ON m.id_modalidade = cc.id_modalidade LEFT JOIN locais l ON l.id_local = cc.id_local WHERE cc.id_interclasse = ? AND cc.cronograma_versao = ? ORDER BY cc.data_compromisso, cc.inicio_compromisso, cc.id_local, cc.id_compromisso', 'ii', [$editionId, $publishedVersion]);
        $nodes = $this->all('SELECT id_no, id_modalidade, id_turma, chave_tag, tipo_no, fase_largura, slot, origem_a_tag, origem_b_tag, id_equipe_a, id_equipe_b, cronograma_versao FROM cronograma_nos WHERE id_interclasse = ? AND cronograma_versao = ? ORDER BY id_modalidade, id_turma, fase_largura DESC, slot', 'ii', [$editionId, $publishedVersion]);
        $incomplete = $this->all('SELECT e.id_equipe, e.modalidades_id_modalidade AS id_modalidade, e.turmas_id_turma AS id_turma, ep.min_inscritos, COUNT(ehu.usuarios_id_usuario) AS inscritos FROM equipes e INNER JOIN equipe_planejamentos ep ON ep.id_equipe = e.id_equipe LEFT JOIN equipes_has_usuarios ehu ON ehu.equipes_id_equipe = e.id_equipe INNER JOIN modalidades m ON m.id_modalidade = e.modalidades_id_modalidade WHERE m.interclasses_id_interclasse = ? AND m.status_modalidade = \'1\' AND e.status_equipe = \'1\' GROUP BY e.id_equipe, e.modalidades_id_modalidade, e.turmas_id_turma, ep.min_inscritos HAVING COUNT(ehu.usuarios_id_usuario) < ep.min_inscritos ORDER BY e.modalidades_id_modalidade, e.turmas_id_turma, e.id_equipe', 'i', [$editionId]);
        $edition['modalidades'] = $modalities;
        $edition['compromissos'] = $commitments;
        $edition['nos'] = $nodes;
        $edition['equipes_incompletas'] = $incomplete;
        $edition['inscricoes_status_efetivo'] = (string) $edition['inscricoes_status'];
        if ((string) $edition['inscricoes_status'] === 'abertas') {
            $now = new \DateTimeImmutable('now');
            $opening = null;
            $closing = null;
            try {
                $opening = $edition['inscricoes_abertura'] === null ? null : new \DateTimeImmutable((string) $edition['inscricoes_abertura']);
                $closing = $edition['inscricoes_encerramento'] === null ? null : new \DateTimeImmutable((string) $edition['inscricoes_encerramento']);
            } catch (\Throwable) {
                $edition['inscricoes_status_efetivo'] = 'janela_invalida';
            }
            if ($opening === null || $closing === null || $opening >= $closing) {
                $edition['inscricoes_status_efetivo'] = 'janela_invalida';
            } elseif ($now < $opening) {
                $edition['inscricoes_status_efetivo'] = 'programadas';
            } elseif ($now >= $closing) {
                $edition['inscricoes_status_efetivo'] = 'expiradas';
            }
        }
        $edition['operacao'] = [
            'versao_publicada' => $publishedVersion,
            'versao_em_edicao' => (int) $edition['cronograma_versao'],
            'requer_repreparo_mesario' => (string) $edition['cronograma_status'] === CronogramaRules::REVISAO,
            'fila_offline_preservada' => true,
            'liberada' => (bool) $edition['operacao_liberada'],
        ];
        return $edition;
    }

    public function prepareTeams(int $editionId, int $userId): array
    {
        Transaction::begin($this->connection);
        try {
            $edition = $this->lockEdition($editionId);
            if (!in_array((string) $edition['cronograma_status'], [CronogramaRules::RASCUNHO, CronogramaRules::REVISAO], true) || (string) $edition['inscricoes_status'] !== 'fechadas') {
                throw new InvalidArgumentException('As equipes planejadas só podem ser preparadas no rascunho fechado.');
            }
            $modalities = $this->all('SELECT m.id_modalidade, m.nome_modalidade, m.categorias_id_categoria, mp.equipes_planejadas, mp.min_inscritos_equipe, mp.max_inscritos_equipe FROM modalidades m LEFT JOIN modalidade_planejamentos mp ON mp.id_modalidade = m.id_modalidade WHERE m.interclasses_id_interclasse = ? AND m.status_modalidade = \'1\' ORDER BY m.id_modalidade FOR UPDATE', 'i', [$editionId]);
            $created = 0;
            $existing = 0;
            foreach ($modalities as $modality) {
                $quantity = (int) ($modality['equipes_planejadas'] ?? 0);
                if ($quantity <= 0) {
                    throw new InvalidArgumentException('Todas as modalidades ativas precisam de quantidade planejada antes da preparação.');
                }
                $classes = $this->all('SELECT id_turma, nome_turma FROM turmas WHERE interclasses_id_interclasse = ? AND categorias_id_categoria = ? AND status_turma = \'1\' ORDER BY id_turma FOR UPDATE', 'ii', [$editionId, (int) $modality['categorias_id_categoria']]);
                foreach ($classes as $class) {
                    // Equipes padrão podem ter sido criadas antes da preparação e ainda
                    // não possuir uma linha em equipe_planejamentos. Elas continuam sendo
                    // a identidade da equipe escolhida pelo portal e devem ser incorporadas
                    // ao lote de preparação, em vez de recebermos uma equipe paralela.
                    $teams = $this->all('SELECT e.id_equipe, ep.ordem_planejada FROM equipes e LEFT JOIN equipe_planejamentos ep ON ep.id_equipe = e.id_equipe WHERE e.modalidades_id_modalidade = ? AND e.turmas_id_turma = ? AND e.status_equipe = \'1\' ORDER BY COALESCE(ep.ordem_planejada, 0), e.id_equipe FOR UPDATE', 'ii', [(int) $modality['id_modalidade'], (int) $class['id_turma']]);
                    $byOrder = [];
                    $withoutOrder = [];
                    foreach ($teams as $team) {
                        $order = (int) ($team['ordem_planejada'] ?? 0);
                        if ($order > 0) {
                            $byOrder[$order] = (int) $team['id_equipe'];
                        } else {
                            $withoutOrder[] = (int) $team['id_equipe'];
                        }
                        if ($order > $quantity) {
                            $linked = $this->one('SELECT 1 FROM equipes_has_usuarios WHERE equipes_id_equipe = ? LIMIT 1', 'i', [(int) $team['id_equipe']]);
                            if ($linked !== null) {
                                throw new InvalidArgumentException('A redução da quantidade não pode remover uma equipe com inscritos.');
                            }
                            $linked = $this->one('SELECT 1 FROM jogos j INNER JOIN partidas p ON p.jogos_id_jogo = j.id_jogo WHERE p.equipes_id_equipe = ? OR j.modalidades_id_modalidade = ? LIMIT 1', 'ii', [(int) $team['id_equipe'], (int) $modality['id_modalidade']]);
                            if ($linked !== null) {
                                throw new InvalidArgumentException('A redução da quantidade não pode remover uma equipe com jogos ou histórico.');
                            }
                            $deactivate = $this->prepare("UPDATE equipes SET status_equipe = '0' WHERE id_equipe = ?");
                            $teamIdToDeactivate = (int) $team['id_equipe'];
                            $deactivate->bind_param('i', $teamIdToDeactivate);
                            if (!$deactivate->execute()) {
                                $deactivate->close();
                                throw new RuntimeException('Não foi possível reduzir as equipes planejadas.');
                            }
                            $deactivate->close();
                            $meta = $this->prepare('UPDATE equipe_planejamentos SET planejada = 0 WHERE id_equipe = ?');
                            $meta->bind_param('i', $teamIdToDeactivate);
                            $meta->execute();
                            $meta->close();
                        }
                    }
                    for ($order = 1; $order <= $quantity; $order++) {
                        $existingTeamId = isset($byOrder[$order])
                            ? (int) $byOrder[$order]
                            : (int) array_shift($withoutOrder);
                        if ($existingTeamId > 0) {
                            $min = (int) ($modality['min_inscritos_equipe'] ?? 1);
                            $max = (int) ($modality['max_inscritos_equipe'] ?? 1);
                            $activate = $this->prepare('INSERT INTO equipe_planejamentos (id_equipe, ordem_planejada, planejada, min_inscritos, max_inscritos) VALUES (?, ?, 1, ?, ?) ON DUPLICATE KEY UPDATE ordem_planejada = VALUES(ordem_planejada), planejada = 1, min_inscritos = VALUES(min_inscritos), max_inscritos = VALUES(max_inscritos)');
                            $activate->bind_param('iiii', $existingTeamId, $order, $min, $max);
                            if (!$activate->execute()) {
                                $activate->close();
                                throw new RuntimeException('Não foi possível reativar a equipe planejada.');
                            }
                            $activate->close();
                            $existing++;
                            continue;
                        }
                        $name = trim((string) $class['nome_turma']) . ' ' . trim((string) $modality['nome_modalidade']) . ' - ' . $order;
                        $statement = $this->prepare('INSERT INTO equipes (status_equipe, modalidades_id_modalidade, turmas_id_turma, nome_equipe) VALUES (\'1\', ?, ?, ?)');
                        $modalityId = (int) $modality['id_modalidade'];
                        $classId = (int) $class['id_turma'];
                        $min = (int) ($modality['min_inscritos_equipe'] ?? 1);
                        $max = (int) ($modality['max_inscritos_equipe'] ?? 1);
                        $statement->bind_param('iis', $modalityId, $classId, $name);
                        if (!$statement->execute()) {
                            $statement->close();
                            throw new RuntimeException('Não foi possível preparar as equipes da modalidade.');
                        }
                        $statement->close();
                        $teamId = (int) $this->connection->insert_id;
                        $meta = $this->prepare('INSERT INTO equipe_planejamentos (id_equipe, ordem_planejada, planejada, min_inscritos, max_inscritos) VALUES (?, ?, 1, ?, ?)');
                        $meta->bind_param('iiii', $teamId, $order, $min, $max);
                        if (!$meta->execute()) {
                            $meta->close();
                            throw new RuntimeException('Não foi possível gravar a configuração da equipe planejada.');
                        }
                        $meta->close();
                        $created++;
                    }
                }
            }
            Transaction::commit($this->connection);
            return ['success' => true, 'equipes_criadas' => $created, 'equipes_existentes' => $existing];
        } catch (\Throwable $exception) {
            Transaction::rollback($this->connection);
            throw $exception;
        }
    }

    public function generateDraft(int $editionId, int $userId, array $options): array
    {
        $edition = $this->lockEditionForRead($editionId);
        if ((string) $edition['inscricoes_status'] !== 'fechadas' || !in_array((string) $edition['cronograma_status'], [CronogramaRules::RASCUNHO, CronogramaRules::REVISAO], true)) {
            throw new InvalidArgumentException('Gere a agenda somente com as inscrições fechadas e o cronograma em rascunho ou revisão.');
        }
        $startDate = trim((string) ($options['data_inicio'] ?? ''));
        $endDate = trim((string) ($options['data_fim'] ?? $startDate));
        $startTime = trim((string) ($options['hora_inicio'] ?? '08:00'));
        $endTime = trim((string) ($options['hora_fim'] ?? '18:00'));
        try {
            $cursor = new \DateTimeImmutable($startDate . ' ' . $startTime);
            $lastDate = new \DateTimeImmutable($endDate . ' ' . $endTime);
            new \DateTimeImmutable('2000-01-01 ' . $startTime);
            new \DateTimeImmutable('2000-01-01 ' . $endTime);
        } catch (\Throwable) {
            throw new InvalidArgumentException('A janela da agenda é inválida.');
        }
        if ($cursor >= $lastDate) {
            throw new InvalidArgumentException('A janela da agenda deve ter início anterior ao fim.');
        }
        $durationDefault = $this->positiveOption($options['duracao_min'] ?? 30, 'A duração padrão');
        $gapDefault = $this->nonNegativeOption($options['intervalo_min'] ?? 10, 'O intervalo padrão');
        $localIds = $this->planningLocalIds($editionId, $options['id_locais'] ?? []);
        if ($localIds === []) {
            throw new InvalidArgumentException('Informe ao menos um local ativo para gerar a agenda.');
        }
        $modalities = $this->all('SELECT m.id_modalidade, m.nome_modalidade, m.categorias_id_categoria, tm.nome_tipo_modalidade, mp.equipes_planejadas, mp.min_inscritos_equipe, mp.max_inscritos_equipe, mp.formato_participacao, mp.duracao_prevista_min, mp.descanso_min FROM modalidades m LEFT JOIN modalidade_planejamentos mp ON mp.id_modalidade = m.id_modalidade INNER JOIN tipos_modalidades tm ON tm.id_tipo_modalidade = m.tipos_modalidades_id_tipo_modalidade WHERE m.interclasses_id_interclasse = ? AND m.status_modalidade = \'1\' ORDER BY m.id_modalidade', 'i', [$editionId]);
        if ($modalities === []) {
            throw new InvalidArgumentException('Cadastre e configure ao menos uma modalidade ativa antes de gerar a agenda.');
        }
        $preparedTeams = $this->assertPreparedTeams($editionId, $modalities);
        $nodes = [];
        $scheduledNodes = [];
        $pendencias = [];
        $occupiedVersion = $edition['versao_publicada'] === null ? (int) $edition['cronograma_versao'] : (int) $edition['versao_publicada'];
        $replacedVersion = (string) $edition['cronograma_status'] === CronogramaRules::REVISAO && $edition['versao_publicada'] !== null
            ? (int) $edition['versao_publicada']
            : null;
        $occupied = $this->occupiedSlots($editionId, $occupiedVersion, $replacedVersion);
        foreach ($modalities as $modality) {
            $modalityId = (int) $modality['id_modalidade'];
            if ($modality['equipes_planejadas'] === null || (int) $modality['equipes_planejadas'] <= 0) {
                throw new InvalidArgumentException('Todas as modalidades ativas precisam de quantidade planejada antes de gerar a agenda.');
            }
            $duration = (int) ($modality['duracao_prevista_min'] ?? 0) > 0 ? (int) $modality['duracao_prevista_min'] : $durationDefault;
            $gap = max($gapDefault, (int) ($modality['descanso_min'] ?? 0));
            $teamRows = $preparedTeams[$modalityId] ?? [];
            $teamIds = array_map(static fn (array $team): int => (int) $team['id_equipe'], $teamRows);
            if ($teamIds === []) {
                $pendencias[] = ['tipo' => 'equipes', 'id_modalidade' => $modalityId, 'mensagem' => 'A modalidade ainda não possui equipes planejadas para as turmas ativas da categoria.'];
                continue;
            }
            $classes = array_values(array_unique(array_map(static fn (array $team): int => (int) $team['id_turma'], $teamRows)));
            $classId = count($classes) === 1 ? $classes[0] : null;
            $format = strtolower((string) ($modality['nome_tipo_modalidade'] ?? '')) === 'individual' ? 'individual' : strtolower((string) ($modality['formato_participacao'] ?? ''));
            if ($format === 'individual') {
                $node = [
                    'id_modalidade' => $modalityId,
                    'id_turma' => $classId,
                    'chave_tag' => sprintf('PL:%d:%d:IND:0', $modalityId, $classId ?? 0),
                    'tipo_no' => 'individual',
                    'fase_largura' => 1,
                    'slot' => 0,
                    'origem_a_tag' => null,
                    'origem_b_tag' => null,
                    'id_equipe_a' => $teamIds[0],
                    'id_equipe_b' => null,
                    'equipe_ids' => $teamIds,
                    'condicional' => 0,
                ];
                $nodes[] = $node;
                $scheduledNodes[] = [$node, $duration, $gap];
            } else {
                foreach (CronogramaBracketPlanner::plan($modalityId, $classId, $teamIds) as $node) {
                    $node['id_modalidade'] = $modalityId;
                    $node['id_turma'] = $classId;
                    $nodes[] = $node;
                    if ($node['tipo_no'] !== 'bye') {
                        $scheduledNodes[] = [$node, $duration, $gap];
                    }
                }
            }
        }
        $commitments = [];
        $localIndex = 0;
        foreach ($scheduledNodes as [$node, $duration, $gap]) {
            $slot = $this->nextDraftSlot($cursor, $lastDate, $duration, $gap, $localIds, $localIndex, $startTime, $endTime, $occupied);
            if ($slot === null) {
                $pendencias[] = ['tipo' => 'janela', 'id_modalidade' => (int) $node['id_modalidade'], 'id_turma' => (int) $node['id_turma'], 'chave_tag' => (string) $node['chave_tag'], 'mensagem' => 'A janela e os locais não comportam todos os compromissos.'];
                continue;
            }
            [$cursor, $localIndex, $date, $start, $end, $local] = $slot;
            $commitments[] = [
                'id_modalidade' => (int) $node['id_modalidade'],
                'id_equipe' => (int) ($node['id_equipe_a'] ?? 0),
                'chave_tag' => (string) $node['chave_tag'],
                'data_compromisso' => $date,
                'inicio_compromisso' => $start,
                'termino_compromisso' => $end,
                'id_local' => $local,
                'condicional' => (int) ($node['condicional'] ?? 0),
            ];
            $occupied[] = ['data' => $date, 'inicio' => $start, 'termino' => $end, 'local' => $local];
        }
        return ['success' => $pendencias === [], 'cronograma_versao' => (int) $edition['cronograma_versao'], 'compromissos' => $commitments, 'nos' => $nodes, 'pendencias' => $pendencias];
    }

    public function publish(int $editionId, int $userId, int $expectedRevision, array $commitments, array $nodes = []): array
    {
        Transaction::begin($this->connection);
        try {
            $edition = $this->lockEdition($editionId);
            $this->assertRevision($edition, $expectedRevision);
            if ((string) $edition['inscricoes_status'] !== 'fechadas' || !in_array((string) $edition['cronograma_status'], [CronogramaRules::RASCUNHO, CronogramaRules::REVISAO], true)) {
                throw new InvalidArgumentException('Feche as inscrições e mantenha o cronograma em rascunho ou revisão antes de publicar.');
            }
            $modalities = $this->all('SELECT m.id_modalidade, m.nome_modalidade, m.categorias_id_categoria, mp.equipes_planejadas, mp.min_inscritos_equipe, mp.max_inscritos_equipe, mp.formato_participacao FROM modalidades m LEFT JOIN modalidade_planejamentos mp ON mp.id_modalidade = m.id_modalidade WHERE m.interclasses_id_interclasse = ? AND m.status_modalidade = \'1\'', 'i', [$editionId]);
            if ($modalities === []) {
                throw new InvalidArgumentException('Cadastre ao menos uma modalidade ativa.');
            }
            foreach ($modalities as $modality) {
                if ($modality['equipes_planejadas'] === null || (int) $modality['equipes_planejadas'] <= 0) {
                    throw new InvalidArgumentException('Todas as modalidades ativas precisam de quantidade planejada de equipes.');
                }
            }
            if ($nodes === []) {
                throw new InvalidArgumentException('A publicação exige os nós do cronograma gerado.');
            }
            $this->validateCommitments($editionId, $modalities, $commitments, $nodes);
            $localIds = array_values(array_unique(array_map(static fn (array $item): int => (int) ($item['id_local'] ?? 0), $commitments)));
            MysqliLocalScheduleGuard::lockLocals($this->connection, $localIds);
            $this->assertNoExternalCommitmentConflicts($editionId, $commitments);
            $version = (int) $edition['cronograma_versao'] + 1;
            $this->insertNodes($editionId, $version, $nodes);
            $this->insertCommitments($editionId, $version, $commitments);
            $statement = $this->prepare("UPDATE interclasse_planejamentos SET cronograma_status = 'publicado', inscricoes_status = 'fechadas', operacao_liberada = 0, cronograma_versao = ?, versao_publicada = ? WHERE id_interclasse = ? AND cronograma_versao = ?");
            $statement->bind_param('iiii', $version, $version, $editionId, $expectedRevision);
            if (!$statement->execute() || $statement->affected_rows !== 1) {
                $statement->close();
                throw new RuntimeException('O cronograma foi alterado durante a publicação.');
            }
            $statement->close();
            Transaction::commit($this->connection);
            return ['success' => true, 'cronograma_status' => CronogramaRules::PUBLICADO, 'inscricoes_status' => 'fechadas', 'cronograma_versao' => $version, 'compromissos' => count($commitments), 'nos' => count($nodes)];
        } catch (\Throwable $exception) {
            Transaction::rollback($this->connection);
            throw $exception;
        }
    }

    public function openRegistrations(int $editionId, int $userId, int $expectedRevision, ?string $opening, ?string $closing): array
    {
        Transaction::begin($this->connection);
        try {
            $edition = $this->lockEdition($editionId);
            $this->assertRevision($edition, $expectedRevision);
            if ((string) $edition['cronograma_status'] !== CronogramaRules::PUBLICADO) {
                throw new InvalidArgumentException('Publique o cronograma antes de abrir as inscrições.');
            }
            if ((int) $edition['operacao_liberada'] === 1) {
                throw new InvalidArgumentException('As inscrições não podem ser reabertas depois que a operação foi liberada.');
            }
            $statement = $this->prepare("UPDATE interclasse_planejamentos SET inscricoes_status = 'abertas', inscricoes_abertura = ?, inscricoes_encerramento = ? WHERE id_interclasse = ? AND cronograma_versao = ?");
            $statement->bind_param('ssii', $opening, $closing, $editionId, $expectedRevision);
            if (!$statement->execute()) {
                $statement->close();
                throw new RuntimeException('O cronograma foi alterado durante a abertura das inscrições.');
            }
            $statement->close();
            Transaction::commit($this->connection);
            return ['success' => true, 'cronograma_status' => CronogramaRules::PUBLICADO, 'inscricoes_status' => 'abertas', 'cronograma_versao' => $expectedRevision];
        } catch (\Throwable $exception) {
            Transaction::rollback($this->connection);
            throw $exception;
        }
    }

    public function closeRegistrations(int $editionId, int $userId, int $expectedRevision): array
    {
        Transaction::begin($this->connection);
        try {
            $edition = $this->lockEdition($editionId);
            $this->assertRevision($edition, $expectedRevision);
            if ((string) $edition['cronograma_status'] !== CronogramaRules::PUBLICADO || (int) $edition['operacao_liberada'] === 1) {
                throw new InvalidArgumentException('Somente uma competição publicada e ainda não liberada pode encerrar as inscrições.');
            }
            if ((string) $edition['inscricoes_status'] === 'encerradas') {
                Transaction::commit($this->connection);
                return ['success' => true, 'cronograma_status' => CronogramaRules::PUBLICADO, 'inscricoes_status' => 'encerradas', 'cronograma_versao' => $expectedRevision, 'idempotente' => true];
            }
            if (!in_array((string) $edition['inscricoes_status'], ['abertas', 'fechadas'], true)) {
                throw new InvalidArgumentException('O estado atual das inscrições não pode ser encerrado.');
            }
            $statement = $this->prepare("UPDATE interclasse_planejamentos SET inscricoes_status = 'encerradas' WHERE id_interclasse = ? AND cronograma_versao = ?");
            $statement->bind_param('ii', $editionId, $expectedRevision);
            if (!$statement->execute()) {
                $statement->close();
                throw new RuntimeException('Não foi possível encerrar as inscrições.');
            }
            $statement->close();
            Transaction::commit($this->connection);
            return ['success' => true, 'cronograma_status' => (string) $edition['cronograma_status'], 'inscricoes_status' => 'encerradas', 'cronograma_versao' => $expectedRevision];
        } catch (\Throwable $exception) {
            Transaction::rollback($this->connection);
            throw $exception;
        }
    }

    public function releaseOperation(int $editionId, int $userId, int $expectedRevision): array
    {
        Transaction::begin($this->connection);
        try {
            $edition = $this->lockEdition($editionId);
            $this->assertRevision($edition, $expectedRevision);
            if ((int) $edition['operacao_liberada'] === 1) {
                Transaction::commit($this->connection);
                return ['success' => true, 'cronograma_status' => CronogramaRules::PUBLICADO, 'inscricoes_status' => 'encerradas', 'cronograma_versao' => $expectedRevision, 'liberada' => true, 'idempotente' => true, 'jogos_criados' => 0];
            }
            if ((string) $edition['cronograma_status'] !== CronogramaRules::PUBLICADO || (string) $edition['inscricoes_status'] !== 'encerradas') {
                throw new InvalidArgumentException('Encerre as inscrições antes de liberar a operação.');
            }
            $incomplete = $this->all('SELECT e.id_equipe FROM equipes e INNER JOIN equipe_planejamentos ep ON ep.id_equipe = e.id_equipe INNER JOIN modalidades m ON m.id_modalidade = e.modalidades_id_modalidade INNER JOIN turmas t ON t.id_turma = e.turmas_id_turma AND t.interclasses_id_interclasse = m.interclasses_id_interclasse AND t.categorias_id_categoria = m.categorias_id_categoria AND t.status_turma = \'1\' LEFT JOIN equipes_has_usuarios ehu ON ehu.equipes_id_equipe = e.id_equipe WHERE m.interclasses_id_interclasse = ? AND m.status_modalidade = \'1\' AND e.status_equipe = \'1\' GROUP BY e.id_equipe, ep.min_inscritos HAVING COUNT(ehu.usuarios_id_usuario) < ep.min_inscritos FOR UPDATE', 'i', [$editionId]);
            if ($incomplete !== []) {
                throw new InvalidArgumentException('Resolva os mínimos de elenco antes de liberar a operação.');
            }
            $version = $edition['versao_publicada'] === null ? (int) $edition['cronograma_versao'] : (int) $edition['versao_publicada'];
            $nodes = $this->all('SELECT id_no, id_modalidade, tipo_no, chave_tag, origem_a_tag, origem_b_tag FROM cronograma_nos WHERE id_interclasse = ? AND cronograma_versao = ? ORDER BY fase_largura DESC, slot, id_no FOR UPDATE', 'ii', [$editionId, $version]);
            if ($nodes === []) {
                throw new InvalidArgumentException('Publique uma árvore de competição antes de liberar a operação.');
            }
            $activeModalities = $this->all('SELECT m.id_modalidade, m.nome_modalidade, m.categorias_id_categoria, mp.equipes_planejadas, mp.min_inscritos_equipe, mp.max_inscritos_equipe FROM modalidades m LEFT JOIN modalidade_planejamentos mp ON mp.id_modalidade = m.id_modalidade WHERE m.interclasses_id_interclasse = ? AND m.status_modalidade = \'1\' ORDER BY m.id_modalidade', 'i', [$editionId]);
            $expectedTeams = $this->assertPreparedTeams($editionId, $activeModalities);
            $treeTeams = $this->all('SELECT DISTINCT cn.id_modalidade, cne.id_equipe FROM cronograma_nos cn INNER JOIN cronograma_no_equipes cne ON cne.id_no = cn.id_no WHERE cn.id_interclasse = ? AND cn.cronograma_versao = ?', 'ii', [$editionId, $version]);
            $publishedTeams = [];
            foreach ($treeTeams as $treeTeam) {
                $publishedTeams[(int) $treeTeam['id_modalidade']][] = (int) $treeTeam['id_equipe'];
            }
            $expectedModalityIds = array_map('intval', array_keys($expectedTeams));
            $publishedModalityIds = array_map('intval', array_keys($publishedTeams));
            sort($expectedModalityIds, SORT_NUMERIC);
            sort($publishedModalityIds, SORT_NUMERIC);
            if ($expectedModalityIds !== $publishedModalityIds) {
                throw new InvalidArgumentException('As modalidades da publicação mudaram desde a geração. Reabra a revisão e publique a versão atualizada.');
            }
            foreach ($expectedTeams as $modalityId => $teamRows) {
                $expectedIds = array_map(static fn (array $team): int => (int) $team['id_equipe'], $teamRows);
                $treeIds = array_values(array_unique($publishedTeams[$modalityId] ?? []));
                sort($expectedIds, SORT_NUMERIC);
                sort($treeIds, SORT_NUMERIC);
                if ($expectedIds !== $treeIds) {
                    throw new InvalidArgumentException('As equipes da publicação mudaram desde a geração. Reabra a revisão, prepare as equipes e publique novamente.');
                }
            }
            $statement = $this->prepare("UPDATE interclasse_planejamentos SET operacao_liberada = 1 WHERE id_interclasse = ? AND cronograma_versao = ? AND inscricoes_status = 'encerradas'");
            $statement->bind_param('ii', $editionId, $expectedRevision);
            if (!$statement->execute() || $statement->affected_rows !== 1) {
                $statement->close();
                throw new RuntimeException('O cronograma foi alterado durante a liberação da operação.');
            }
            $statement->close();

            // O sinalizador só fica visível após o commit da transação. Enquanto
            // isso, materialize os confrontos de abertura pela árvore publicada.
            $gamesCreated = 0;
            $individualModalities = [];
            foreach ($nodes as $node) {
                if (($node['origem_a_tag'] ?? null) !== null || ($node['origem_b_tag'] ?? null) !== null) {
                    continue;
                }
                if ((string) $node['tipo_no'] === 'bye') {
                    continue;
                }
                if ((string) $node['tipo_no'] === 'individual') {
                    $modalityId = (int) $node['id_modalidade'];
                    if (!isset($individualModalities[$modalityId])) {
                        $gamesCreated += $this->materializeIndividualNode($editionId, $version, $node);
                        $individualModalities[$modalityId] = true;
                    }
                    continue;
                }
                $materialized = $this->materializeNode($editionId, $userId, (int) $node['id_no']);
                if (($materialized['materializado'] ?? false) !== true) {
                    throw new InvalidArgumentException('Não foi possível preparar todos os confrontos iniciais da publicação.');
                }
                if (($materialized['idempotente'] ?? false) !== true) {
                    $gamesCreated++;
                }
            }

            Transaction::commit($this->connection);
            return ['success' => true, 'cronograma_status' => CronogramaRules::PUBLICADO, 'inscricoes_status' => 'encerradas', 'cronograma_versao' => $expectedRevision, 'liberada' => true, 'jogos_criados' => $gamesCreated];
        } catch (\Throwable $exception) {
            Transaction::rollback($this->connection);
            throw $exception;
        }
    }

    public function review(int $editionId, int $userId, int $expectedRevision): array
    {
        Transaction::begin($this->connection);
        try {
            $edition = $this->lockEdition($editionId);
            $this->assertRevision($edition, $expectedRevision);
            if ((string) $edition['cronograma_status'] !== CronogramaRules::PUBLICADO) {
                throw new InvalidArgumentException('Somente um cronograma publicado pode entrar em revisão.');
            }
            if ((int) $edition['operacao_liberada'] === 1) {
                throw new InvalidArgumentException('A operação já começou; a árvore não pode ser substituída sem alterar jogos ou resultados.');
            }
            $nextVersion = (int) $edition['cronograma_versao'] + 1;
            $statement = $this->prepare("UPDATE interclasse_planejamentos SET cronograma_status = 'revisao', inscricoes_status = 'fechadas', operacao_liberada = 0, cronograma_versao = ? WHERE id_interclasse = ? AND cronograma_versao = ?");
            $statement->bind_param('iii', $nextVersion, $editionId, $expectedRevision);
            if (!$statement->execute() || $statement->affected_rows !== 1) {
                $statement->close();
                throw new RuntimeException('O cronograma foi alterado durante a revisão.');
            }
            $statement->close();
            $impact = $this->all('SELECT e.id_equipe, e.modalidades_id_modalidade AS id_modalidade, e.turmas_id_turma AS id_turma, ep.min_inscritos, COUNT(ehu.usuarios_id_usuario) AS inscritos FROM equipes e INNER JOIN equipe_planejamentos ep ON ep.id_equipe = e.id_equipe LEFT JOIN equipes_has_usuarios ehu ON ehu.equipes_id_equipe = e.id_equipe INNER JOIN modalidades m ON m.id_modalidade = e.modalidades_id_modalidade WHERE m.interclasses_id_interclasse = ? AND m.status_modalidade = \'1\' AND e.status_equipe = \'1\' GROUP BY e.id_equipe, e.modalidades_id_modalidade, e.turmas_id_turma, ep.min_inscritos HAVING COUNT(ehu.usuarios_id_usuario) < ep.min_inscritos ORDER BY e.id_equipe', 'i', [$editionId]);
            Transaction::commit($this->connection);
            return ['success' => true, 'cronograma_status' => CronogramaRules::REVISAO, 'inscricoes_status' => 'fechadas', 'cronograma_versao' => $nextVersion, 'versao_suspensa' => $expectedRevision, 'equipes_incompletas' => $impact];
        } catch (\Throwable $exception) {
            Transaction::rollback($this->connection);
            throw $exception;
        }
    }

    public function materializeNode(int $editionId, int $userId, int $nodeId): array
    {
        Transaction::begin($this->connection);
        try {
            $edition = $this->lockEdition($editionId);
            if ((string) $edition['cronograma_status'] !== CronogramaRules::PUBLICADO || (string) $edition['inscricoes_status'] !== 'encerradas' || (int) $edition['operacao_liberada'] !== 1) {
                throw new InvalidArgumentException('A materialização exige cronograma publicado, inscrições encerradas e operação liberada.');
            }
            $version = $edition['versao_publicada'] === null ? (int) $edition['cronograma_versao'] : (int) $edition['versao_publicada'];
            $node = $this->one('SELECT id_no, id_jogo, id_modalidade, id_turma, tipo_no, chave_tag, origem_a_tag, origem_b_tag FROM cronograma_nos WHERE id_interclasse = ? AND cronograma_versao = ? AND id_no = ? LIMIT 1 FOR UPDATE', 'iii', [$editionId, $version, $nodeId]);
            if ($node === null) {
                throw new InvalidArgumentException('Nó do cronograma não encontrado na versão publicada.');
            }
            $tag = (string) $node['chave_tag'];
            if ((string) $node['tipo_no'] === 'bye') {
                Transaction::commit($this->connection);
                return ['success' => true, 'materializado' => false, 'bye' => true, 'chave_tag' => $tag, 'mensagem' => 'BYE estrutural não cria partida física.'];
            }
            $commitment = $this->one('SELECT data_compromisso, inicio_compromisso, termino_compromisso, id_local FROM cronograma_compromissos WHERE id_interclasse = ? AND id_modalidade = ? AND cronograma_versao = ? AND chave_tag = ? LIMIT 1 FOR UPDATE', 'iiis', [$editionId, (int) $node['id_modalidade'], $version, $tag]);
            if ($commitment === null) {
                throw new InvalidArgumentException('O nó não possui compromisso físico publicado.');
            }
            $existing = $this->all('SELECT id_jogo, status_jogo FROM jogos WHERE modalidades_id_modalidade = ? AND nome_jogo = ? ORDER BY id_jogo FOR UPDATE', 'is', [(int) $node['id_modalidade'], $tag]);
            if (count($existing) > 1) {
                throw new RuntimeException('Há jogos duplicados com a identidade deste nó publicado.');
            }
            if ($existing !== []) {
                $gameId = (int) $existing[0]['id_jogo'];
                if ((int) ($node['id_jogo'] ?? 0) > 0 && (int) $node['id_jogo'] !== $gameId) {
                    throw new RuntimeException('O nó publicado já está vinculado a outro jogo.');
                }
                $this->assertGameParticipants($gameId, $this->plannedNodeParticipants($editionId, (int) $node['id_modalidade'], $version, $node));
                $this->assertGameSchedule($gameId, $commitment);
                $this->linkPlannedGame((int) $node['id_no'], $gameId);
                Transaction::commit($this->connection);
                return ['success' => true, 'materializado' => true, 'id_jogo' => $gameId, 'id_modalidade' => (int) $node['id_modalidade'], 'chave_tag' => $tag, 'idempotente' => true];
            }
            $participants = $this->plannedNodeParticipants($editionId, (int) $node['id_modalidade'], $version, $node);
            if ($participants === null) {
                Transaction::commit($this->connection);
                return ['success' => false, 'materializado' => false, 'aguardando_resultado' => true, 'chave_tag' => $tag];
            }
            $required = (string) $node['tipo_no'] === 'individual' ? 1 : 2;
            if (count($participants) < $required || !$this->teamsHaveRoster($participants)) {
                Transaction::commit($this->connection);
                return ['success' => false, 'materializado' => false, 'aguardando_elenco' => true, 'chave_tag' => $tag];
            }
            $statement = $this->prepare("INSERT INTO jogos (nome_jogo, data_jogo, inicio_jogo, termino_jogo, status_jogo, modalidades_id_modalidade, locais_id_local) VALUES (?, ?, ?, ?, 'Agendado', ?, ?)");
            $modality = (int) $node['id_modalidade'];
            $local = (int) $commitment['id_local'];
            $date = (string) $commitment['data_compromisso'];
            $start = (string) $commitment['inicio_compromisso'];
            $end = (string) $commitment['termino_compromisso'];
            MysqliLocalScheduleGuard::lockLocals($this->connection, [$local]);
            MysqliLocalScheduleGuard::assertLocalBelongsToEdition($this->connection, $local, $editionId);
            $conflict = MysqliLocalScheduleGuard::conflictWithGames($this->connection, $date, $local, $start, $end, [], true);
            if ($conflict !== null) {
                throw new InvalidArgumentException($conflict);
            }
            $statement->bind_param('ssssii', $tag, $date, $start, $end, $modality, $local);
            if (!$statement->execute()) {
                $error = $statement->error;
                $statement->close();
                throw new RuntimeException($error !== '' ? $error : 'Não foi possível materializar o jogo planejado.');
            }
            $gameId = (int) $this->connection->insert_id;
            $statement->close();
            $partida = $this->prepare('INSERT INTO partidas (jogos_id_jogo, equipes_id_equipe, resultado_partida, status_partida) VALUES (?, ?, 0, \'1\')');
            foreach ($participants as $teamId) {
                $partida->bind_param('ii', $gameId, $teamId);
                if (!$partida->execute()) {
                    $error = $partida->error;
                    $partida->close();
                    throw new RuntimeException($error !== '' ? $error : 'Não foi possível materializar as equipes do jogo planejado.');
                }
            }
            $partida->close();
            $this->linkPlannedGame((int) $node['id_no'], $gameId);
            Transaction::commit($this->connection);
            return ['success' => true, 'materializado' => true, 'id_jogo' => $gameId, 'id_modalidade' => $modality, 'chave_tag' => $tag, 'equipes' => $participants];
        } catch (\Throwable $exception) {
            Transaction::rollback($this->connection);
            throw $exception;
        }
    }

    /**
     * Reconcile a temporary offline result with the exact node in the current
     * published tree. A planned tag never falls through to candidate matching.
     *
     * @param list<int> $teamIds
     */
    public function materializePlannedGameForResult(int $editionId, int $modalityId, string $tag, array $teamIds): ?int
    {
        $identity = ChaveamentoRules::parse($tag);
        if ($identity === null || empty($identity['planejado'])) {
            return null;
        }
        if ((int) ($identity['modalidade'] ?? 0) !== $modalityId) {
            throw new InvalidArgumentException('A tag planejada não corresponde à modalidade do resultado.');
        }

        Transaction::begin($this->connection);
        try {
            $edition = $this->lockEdition($editionId);
            if ((string) $edition['cronograma_status'] !== CronogramaRules::PUBLICADO
                || (string) $edition['inscricoes_status'] !== 'encerradas'
                || (int) $edition['operacao_liberada'] !== 1) {
                throw new InvalidArgumentException('Sincronize somente jogos da publicação encerrada e liberada.');
            }
            $version = $edition['versao_publicada'] === null ? (int) $edition['cronograma_versao'] : (int) $edition['versao_publicada'];
            $nodes = $this->all('SELECT id_no FROM cronograma_nos WHERE id_interclasse = ? AND id_modalidade = ? AND cronograma_versao = ? AND chave_tag = ? FOR UPDATE', 'iiis', [$editionId, $modalityId, $version, $tag]);
            if (count($nodes) !== 1) {
                throw new InvalidArgumentException('O jogo temporário não pertence a um nó único da árvore publicada.');
            }
            $materialized = $this->materializeNode($editionId, 0, (int) $nodes[0]['id_no']);
            if (($materialized['materializado'] ?? false) !== true) {
                throw new InvalidArgumentException('A origem do jogo ainda não liberou este confronto na árvore publicada.');
            }
            $gameId = (int) $materialized['id_jogo'];
            $this->assertGameParticipants($gameId, $teamIds);
            Transaction::commit($this->connection);
            return $gameId;
        } catch (\Throwable $exception) {
            Transaction::rollback($this->connection);
            throw $exception;
        }
    }

    /**
     * Avança somente a árvore publicada quando um dos seus jogos termina.
     * A linha de planejamento serializa resultados concorrentes da mesma edição.
     */
    public function advancePlannedFromGame(int $gameId): bool
    {
        $game = $this->one('SELECT j.nome_jogo, j.modalidades_id_modalidade, m.interclasses_id_interclasse FROM jogos j INNER JOIN modalidades m ON m.id_modalidade = j.modalidades_id_modalidade WHERE j.id_jogo = ? LIMIT 1', 'i', [$gameId]);
        $identity = $game === null ? null : ChaveamentoRules::parse((string) $game['nome_jogo']);
        if ($identity === null || empty($identity['planejado'])) {
            return false;
        }
        if (($identity['modalidade'] ?? 0) !== (int) $game['modalidades_id_modalidade']) {
            throw new InvalidArgumentException('O jogo planejado não pertence à modalidade identificada pela árvore.');
        }

        Transaction::begin($this->connection);
        try {
            $editionId = (int) $game['interclasses_id_interclasse'];
            $edition = $this->lockEdition($editionId);
            if ((string) $edition['cronograma_status'] !== CronogramaRules::PUBLICADO
                || (string) $edition['inscricoes_status'] !== 'encerradas'
                || (int) $edition['operacao_liberada'] !== 1) {
                throw new InvalidArgumentException('O avanço exige a publicação encerrada e liberada.');
            }
            $version = $edition['versao_publicada'] === null ? (int) $edition['cronograma_versao'] : (int) $edition['versao_publicada'];
            $source = $this->one('SELECT id_no, chave_tag FROM cronograma_nos WHERE id_interclasse = ? AND id_modalidade = ? AND cronograma_versao = ? AND id_jogo = ? AND chave_tag = ? LIMIT 1 FOR UPDATE', 'iiiis', [$editionId, (int) $game['modalidades_id_modalidade'], $version, $gameId, (string) $game['nome_jogo']]);
            if ($source === null) {
                throw new InvalidArgumentException('O jogo não pertence à árvore publicada.');
            }

            $nodes = $this->all("SELECT id_no, id_jogo, id_modalidade, tipo_no, chave_tag, origem_a_tag, origem_b_tag FROM cronograma_nos WHERE id_interclasse = ? AND id_modalidade = ? AND cronograma_versao = ? AND tipo_no = 'normal' AND (origem_a_tag IS NOT NULL OR origem_b_tag IS NOT NULL) ORDER BY fase_largura DESC, slot FOR UPDATE", 'iii', [$editionId, (int) $game['modalidades_id_modalidade'], $version]);
            foreach ($nodes as $node) {
                $participants = $this->plannedNodeParticipants($editionId, (int) $node['id_modalidade'], $version, $node);
                if ($participants === null || count($participants) !== 2 || !$this->teamsHaveRoster($participants)) {
                    continue;
                }
                if ((int) ($node['id_jogo'] ?? 0) > 0) {
                    $current = $this->all('SELECT equipes_id_equipe FROM partidas WHERE jogos_id_jogo = ? ORDER BY id_partida', 'i', [(int) $node['id_jogo']]);
                    $currentIds = array_map(static fn (array $row): int => (int) $row['equipes_id_equipe'], $current);
                    sort($currentIds);
                    $expectedIds = $participants;
                    sort($expectedIds);
                    if ($currentIds !== $expectedIds) {
                        throw new InvalidArgumentException('O vencedor mudou após a criação da próxima partida. Reabra a competição para revisão controlada.');
                    }
                    continue;
                }
                $commitment = $this->one('SELECT data_compromisso, inicio_compromisso, termino_compromisso, id_local FROM cronograma_compromissos WHERE id_interclasse = ? AND id_modalidade = ? AND cronograma_versao = ? AND chave_tag = ? LIMIT 1 FOR UPDATE', 'iiis', [$editionId, (int) $node['id_modalidade'], $version, (string) $node['chave_tag']]);
                if ($commitment === null) {
                    throw new InvalidArgumentException('O confronto seguinte não possui horário publicado.');
                }
                $local = (int) $commitment['id_local'];
                MysqliLocalScheduleGuard::lockLocals($this->connection, [$local]);
                MysqliLocalScheduleGuard::assertLocalBelongsToEdition($this->connection, $local, $editionId);
                $conflict = MysqliLocalScheduleGuard::conflictWithGames($this->connection, (string) $commitment['data_compromisso'], $local, (string) $commitment['inicio_compromisso'], (string) $commitment['termino_compromisso'], [], true);
                if ($conflict !== null) {
                    throw new InvalidArgumentException($conflict);
                }
                $insert = $this->prepare("INSERT INTO jogos (nome_jogo, data_jogo, inicio_jogo, termino_jogo, status_jogo, modalidades_id_modalidade, locais_id_local) VALUES (?, ?, ?, ?, 'Agendado', ?, ?)");
                $tag = (string) $node['chave_tag'];
                $date = (string) $commitment['data_compromisso'];
                $start = (string) $commitment['inicio_compromisso'];
                $end = (string) $commitment['termino_compromisso'];
                $modalityId = (int) $node['id_modalidade'];
                $insert->bind_param('ssssii', $tag, $date, $start, $end, $modalityId, $local);
                if (!$insert->execute()) {
                    $error = $insert->error;
                    $insert->close();
                    throw new RuntimeException($error !== '' ? $error : 'Não foi possível criar o próximo confronto planejado.');
                }
                $nextGameId = (int) $this->connection->insert_id;
                $insert->close();
                $match = $this->prepare("INSERT INTO partidas (jogos_id_jogo, equipes_id_equipe, resultado_partida, status_partida) VALUES (?, ?, 0, '1')");
                foreach ($participants as $teamId) {
                    $match->bind_param('ii', $nextGameId, $teamId);
                    if (!$match->execute()) {
                        $error = $match->error;
                        $match->close();
                        throw new RuntimeException($error !== '' ? $error : 'Não foi possível incluir o participante do próximo confronto.');
                    }
                }
                $match->close();
                $this->linkPlannedGame((int) $node['id_no'], $nextGameId);
            }
            Transaction::commit($this->connection);
            return true;
        } catch (\Throwable $exception) {
            Transaction::rollback($this->connection);
            throw $exception;
        }
    }

    /**
     * Rebuilds unstarted descendants after correcting a result in a published
     * bracket. Descendants that already started are immutable: throwing here
     * lets the surrounding result transaction roll back the source correction.
     */
    public function rebuildPlannedFromRound(int $modalityId, int $roundWidth): bool
    {
        $planningTables = (int) $this->connection->query(
            "SELECT COUNT(*) FROM information_schema.tables
             WHERE table_schema = DATABASE()
               AND table_name IN ('interclasse_planejamentos', 'cronograma_nos')",
        )->fetch_column();
        if ($planningTables !== 2) {
            return false;
        }
        $edition = $this->one(
            'SELECT m.interclasses_id_interclasse AS edition_id, p.cronograma_versao, p.versao_publicada
             FROM modalidades m
             INNER JOIN interclasse_planejamentos p ON p.id_interclasse = m.interclasses_id_interclasse
             WHERE m.id_modalidade = ? LIMIT 1',
            'i',
            [$modalityId],
        );
        if ($edition === null) {
            return false;
        }
        $editionId = (int) $edition['edition_id'];
        $version = $edition['versao_publicada'] === null
            ? (int) $edition['cronograma_versao']
            : (int) $edition['versao_publicada'];
        $source = $this->one(
            'SELECT id_no FROM cronograma_nos
             WHERE id_interclasse = ? AND id_modalidade = ? AND cronograma_versao = ?
               AND id_jogo IS NOT NULL AND fase_largura = ? LIMIT 1',
            'iiii',
            [$editionId, $modalityId, $version, $roundWidth],
        );
        if ($source === null) {
            return false;
        }

        Transaction::begin($this->connection);
        try {
            $this->lockEdition($editionId);
            $descendants = $this->all(
                'SELECT cn.id_no, cn.chave_tag, cn.origem_a_tag, cn.origem_b_tag,
                        cn.fase_largura, cn.id_jogo, j.status_jogo,
                        (SELECT COUNT(*) FROM artilheiros a WHERE a.jogos_id_jogo = j.id_jogo) AS points,
                        (SELECT COUNT(*) FROM partidas p WHERE p.jogos_id_jogo = j.id_jogo AND p.usuarios_id_usuario IS NOT NULL) AS assigned_players
                 FROM cronograma_nos cn
                 INNER JOIN jogos j ON j.id_jogo = cn.id_jogo
                 WHERE cn.id_interclasse = ? AND cn.id_modalidade = ?
                   AND cn.cronograma_versao = ? AND cn.tipo_no = \'normal\'
                   AND cn.fase_largura < ?
                 ORDER BY cn.fase_largura DESC, cn.slot
                 FOR UPDATE',
                'iiii',
                [$editionId, $modalityId, $version, $roundWidth],
            );
            foreach ($descendants as $descendant) {
                if ((string) $descendant['status_jogo'] !== 'Agendado'
                    || (int) $descendant['points'] > 0
                    || (int) $descendant['assigned_players'] > 0) {
                    throw new InvalidArgumentException('O resultado não pode ser corrigido depois que um confronto seguinte entrou em operação.');
                }
            }

            foreach ($descendants as $descendant) {
                $participants = $this->plannedNodeParticipants($editionId, $modalityId, $version, $descendant);
                if ($participants === null || count($participants) !== 2) {
                    throw new InvalidArgumentException('Não foi possível reconstruir os participantes do confronto seguinte.');
                }
                $gameId = (int) $descendant['id_jogo'];
                $delete = $this->prepare('DELETE FROM partidas WHERE jogos_id_jogo = ?');
                $delete->bind_param('i', $gameId);
                if (!$delete->execute()) {
                    $error = $delete->error;
                    $delete->close();
                    throw new RuntimeException($error !== '' ? $error : 'Não foi possível limpar os participantes do confronto seguinte.');
                }
                $delete->close();

                $insert = $this->prepare("INSERT INTO partidas (jogos_id_jogo, equipes_id_equipe, resultado_partida, status_partida) VALUES (?, ?, 0, '1')");
                foreach ($participants as $teamId) {
                    $insert->bind_param('ii', $gameId, $teamId);
                    if (!$insert->execute()) {
                        $error = $insert->error;
                        $insert->close();
                        throw new RuntimeException($error !== '' ? $error : 'Não foi possível atualizar os participantes do confronto seguinte.');
                    }
                }
                $insert->close();
            }
            Transaction::commit($this->connection);
            return true;
        } catch (\Throwable $exception) {
            Transaction::rollback($this->connection);
            throw $exception;
        }
    }

    /** @param array<string,mixed> $node */
    private function materializeIndividualNode(int $editionId, int $version, array $node): int
    {
        $modalityId = (int) $node['id_modalidade'];
        $commitment = $this->one('SELECT data_compromisso, inicio_compromisso, termino_compromisso, id_local FROM cronograma_compromissos WHERE id_interclasse = ? AND id_modalidade = ? AND cronograma_versao = ? AND chave_tag = ? LIMIT 1 FOR UPDATE', 'iiis', [$editionId, $modalityId, $version, (string) $node['chave_tag']]);
        if ($commitment === null) {
            throw new InvalidArgumentException('A prova individual não possui sessão no calendário publicado.');
        }
        $tag = \App\Modules\Competicoes\Domain\IndividualRules::tag($modalityId);
        $existing = $this->all('SELECT id_jogo FROM jogos WHERE modalidades_id_modalidade = ? AND nome_jogo = ? ORDER BY id_jogo FOR UPDATE', 'is', [$modalityId, $tag]);
        if (count($existing) > 1) {
            throw new RuntimeException('Há mais de um jogo para a prova individual; audite antes da liberação.');
        }
        if ($existing !== []) {
            $this->linkPlannedGame((int) $node['id_no'], (int) $existing[0]['id_jogo']);
            return 0;
        }
        $local = (int) $commitment['id_local'];
        MysqliLocalScheduleGuard::lockLocals($this->connection, [$local]);
        MysqliLocalScheduleGuard::assertLocalBelongsToEdition($this->connection, $local, $editionId);
        $conflict = MysqliLocalScheduleGuard::conflictWithGames($this->connection, (string) $commitment['data_compromisso'], $local, (string) $commitment['inicio_compromisso'], (string) $commitment['termino_compromisso'], [], true);
        if ($conflict !== null) {
            throw new InvalidArgumentException($conflict);
        }
        $statement = $this->prepare("INSERT INTO jogos (nome_jogo, data_jogo, inicio_jogo, termino_jogo, status_jogo, modalidades_id_modalidade, locais_id_local) VALUES (?, ?, ?, ?, 'Agendado', ?, ?)");
        $date = (string) $commitment['data_compromisso'];
        $start = (string) $commitment['inicio_compromisso'];
        $end = (string) $commitment['termino_compromisso'];
        $statement->bind_param('ssssii', $tag, $date, $start, $end, $modalityId, $local);
        if (!$statement->execute()) {
            $error = $statement->error;
            $statement->close();
            throw new RuntimeException($error !== '' ? $error : 'Não foi possível preparar a prova individual planejada.');
        }
        $gameId = (int) $this->connection->insert_id;
        $statement->close();
        $this->linkPlannedGame((int) $node['id_no'], $gameId);
        return 1;
    }

    /** @param array<string,mixed> $node @return list<int>|null */
    private function plannedNodeParticipants(int $editionId, int $modalityId, int $version, array $node, array $visited = []): ?array
    {
        $nodeId = (int) ($node['id_no'] ?? 0);
        if ($nodeId > 0 && isset($visited[$nodeId])) {
            return null;
        }
        if ($nodeId > 0) {
            $visited[$nodeId] = true;
        }
        $origins = array_values(array_filter([(string) ($node['origem_a_tag'] ?? ''), (string) ($node['origem_b_tag'] ?? '')], static fn (string $origin): bool => $origin !== ''));
        if ($origins === []) {
            $rows = $this->all('SELECT id_equipe FROM cronograma_no_equipes WHERE id_no = ? ORDER BY id_equipe', 'i', [(int) $node['id_no']]);
            $teams = array_map(static fn (array $row): int => (int) $row['id_equipe'], $rows);
            return $teams === [] ? null : $teams;
        }
        $participants = [];
        foreach ($origins as $origin) {
            $games = $this->all('SELECT j.id_jogo, j.status_jogo FROM cronograma_nos cn INNER JOIN jogos j ON j.id_jogo = cn.id_jogo WHERE cn.id_interclasse = ? AND cn.id_modalidade = ? AND cn.cronograma_versao = ? AND cn.chave_tag = ? ORDER BY j.id_jogo', 'iiis', [$editionId, $modalityId, $version, $origin]);
            if (count($games) > 1) {
                throw new RuntimeException('A origem do confronto corresponde a mais de um jogo.');
            }
            if ($games !== []) {
                $game = $games[0];
                $winners = $this->all("SELECT equipes_id_equipe AS id_equipe, resultado_partida FROM partidas WHERE jogos_id_jogo = ? AND status_partida = '1' ORDER BY resultado_partida DESC, id_partida ASC LIMIT 2", 'i', [(int) $game['id_jogo']]);
                $winner = $winners[0] ?? null;
                if (!in_array((string) $game['status_jogo'], ['Concluido', 'Finalizado'], true) || $winner === null) {
                    return null;
                }
                if (isset($winners[1]) && (int) $winners[1]['resultado_partida'] === (int) $winner['resultado_partida']) {
                    return null;
                }
                $participants[] = (int) $winner['id_equipe'];
                continue;
            }
            $child = $this->one('SELECT id_no, tipo_no, chave_tag, origem_a_tag, origem_b_tag FROM cronograma_nos WHERE id_interclasse = ? AND id_modalidade = ? AND cronograma_versao = ? AND chave_tag = ? LIMIT 1', 'iiis', [$editionId, $modalityId, $version, $origin]);
            if ($child === null || (string) $child['tipo_no'] !== 'bye') {
                return null;
            }
            $childParticipants = $this->plannedNodeParticipants($editionId, $modalityId, $version, $child, $visited);
            if ($childParticipants === null || count($childParticipants) !== 1) {
                return null;
            }
            $participants[] = $childParticipants[0];
        }
        return array_values(array_unique(array_filter($participants, static fn (int $id): bool => $id > 0)));
    }

    /** @param list<int> $teamIds */
    private function teamsHaveRoster(array $teamIds): bool
    {
        foreach ($teamIds as $teamId) {
            $roster = $this->one('SELECT ep.min_inscritos FROM equipe_planejamentos ep LEFT JOIN equipes_has_usuarios ehu ON ehu.equipes_id_equipe = ep.id_equipe WHERE ep.id_equipe = ? GROUP BY ep.id_equipe, ep.min_inscritos HAVING COUNT(ehu.usuarios_id_usuario) >= ep.min_inscritos', 'i', [$teamId]);
            if ($roster === null) {
                return false;
            }
        }
        return true;
    }

    /** @param list<int>|null $expected */
    private function assertGameParticipants(int $gameId, ?array $expected): void
    {
        if ($expected === null || $expected === []) {
            throw new InvalidArgumentException('Não foi possível resolver os participantes do confronto publicado.');
        }
        $rows = $this->all('SELECT equipes_id_equipe FROM partidas WHERE jogos_id_jogo = ? ORDER BY equipes_id_equipe', 'i', [$gameId]);
        $actual = array_map(static fn (array $row): int => (int) $row['equipes_id_equipe'], $rows);
        $expected = array_values(array_unique(array_map('intval', $expected)));
        sort($actual);
        sort($expected);
        if ($actual !== $expected) {
            throw new InvalidArgumentException('As equipes do jogo não correspondem às origens publicadas do confronto.');
        }
    }

    /** @param array<string,mixed> $commitment */
    private function assertGameSchedule(int $gameId, array $commitment): void
    {
        $game = $this->one('SELECT data_jogo, inicio_jogo, termino_jogo, locais_id_local FROM jogos WHERE id_jogo = ? LIMIT 1 FOR UPDATE', 'i', [$gameId]);
        if ($game === null
            || (string) $game['data_jogo'] !== (string) $commitment['data_compromisso']
            || (string) $game['inicio_jogo'] !== (string) $commitment['inicio_compromisso']
            || (string) $game['termino_jogo'] !== (string) $commitment['termino_compromisso']
            || (int) $game['locais_id_local'] !== (int) $commitment['id_local']) {
            throw new InvalidArgumentException('O jogo existente não respeita o horário e o local do cronograma publicado.');
        }
    }

    private function linkPlannedGame(int $nodeId, int $gameId): void
    {
        $statement = $this->prepare('UPDATE cronograma_nos SET id_jogo = ? WHERE id_no = ? AND (id_jogo IS NULL OR id_jogo = ?)');
        $statement->bind_param('iii', $gameId, $nodeId, $gameId);
        if (!$statement->execute() || $statement->affected_rows > 1) {
            $statement->close();
            throw new RuntimeException('Não foi possível vincular o jogo à árvore publicada.');
        }
        $statement->close();
        $linked = $this->one('SELECT id_jogo FROM cronograma_nos WHERE id_no = ? LIMIT 1 FOR UPDATE', 'i', [$nodeId]);
        if ($linked === null || (int) ($linked['id_jogo'] ?? 0) !== $gameId) {
            throw new RuntimeException('O nó publicado já está vinculado a outro jogo.');
        }
    }

    public function commitmentsForTeams(int $editionId, array $teamIds): array
    {
        $teamIds = array_values(array_unique(array_filter(array_map('intval', $teamIds), static fn (int $id): bool => $id > 0)));
        if ($teamIds === []) {
            return [];
        }
        $state = $this->one('SELECT cronograma_versao, versao_publicada FROM interclasse_planejamentos WHERE id_interclasse = ? LIMIT 1', 'i', [$editionId]);
        $version = $state === null || $state['versao_publicada'] === null ? (int) ($state['cronograma_versao'] ?? 0) : (int) $state['versao_publicada'];
        $marks = implode(',', array_fill(0, count($teamIds), '?'));
        $types = 'ii' . str_repeat('i', count($teamIds));
        $params = array_merge([$editionId, $version], $teamIds);
        return $this->all("SELECT DISTINCT cc.id_compromisso, cc.id_modalidade, COALESCE(cne.id_equipe, cc.id_equipe) AS id_equipe, cc.chave_tag, DATE_FORMAT(cc.data_compromisso, '%Y-%m-%d') AS data_compromisso, TIME_FORMAT(cc.inicio_compromisso, '%H:%i:%s') AS inicio_compromisso, TIME_FORMAT(cc.termino_compromisso, '%H:%i:%s') AS termino_compromisso, cc.id_local, cc.condicional FROM cronograma_compromissos cc LEFT JOIN cronograma_nos cn ON cn.id_interclasse = cc.id_interclasse AND cn.id_modalidade = cc.id_modalidade AND cn.cronograma_versao = cc.cronograma_versao AND cn.chave_tag = cc.chave_tag LEFT JOIN cronograma_no_equipes cne ON cne.id_no = cn.id_no AND cne.id_equipe IN ($marks) WHERE cc.id_interclasse = ? AND cc.cronograma_versao = ? AND (cc.id_equipe IN ($marks) OR cne.id_equipe IS NOT NULL)", str_repeat('i', count($teamIds)) . 'ii' . str_repeat('i', count($teamIds)), array_merge($teamIds, [$editionId, $version], $teamIds));
    }

    public function studentAgenda(int $editionId, int $userId, array $teamIds = []): array
    {
        $edition = $this->one('SELECT id_interclasse, cronograma_status, inscricoes_status, cronograma_versao, versao_publicada FROM interclasse_planejamentos WHERE id_interclasse = ? LIMIT 1', 'i', [$editionId]);
        if ($edition === null) {
            throw new InvalidArgumentException('Edição sem planejamento migrado ou não encontrada.');
        }
        if ((string) $edition['cronograma_status'] !== CronogramaRules::PUBLICADO || $edition['versao_publicada'] === null) {
            return [
                'success' => true,
                'publicado' => false,
                'cronograma_versao' => (int) $edition['cronograma_versao'],
                'versao_publicada' => null,
                'equipes' => [],
                'compromissos' => [],
                'avancos' => [],
            ];
        }

        $student = $this->one('SELECT u.id_usuario, u.turmas_id_turma, u.interclasses_id_interclasse, u.genero_usuario, u.status_usuario, t.categorias_id_categoria FROM usuarios u LEFT JOIN turmas t ON t.id_turma = u.turmas_id_turma WHERE u.id_usuario = ? LIMIT 1', 'i', [$userId]);
        if ($student === null || (string) $student['status_usuario'] !== '1' || (int) ($student['interclasses_id_interclasse'] ?? 0) !== $editionId) {
            throw new InvalidArgumentException('O aluno não pertence à edição solicitada.');
        }
        $classId = (int) ($student['turmas_id_turma'] ?? 0);
        $categoryId = (int) ($student['categorias_id_categoria'] ?? 0);
        $gender = trim((string) ($student['genero_usuario'] ?? ''));
        if ($classId <= 0 || $categoryId <= 0 || $gender === '') {
            throw new InvalidArgumentException('O cadastro do aluno não possui turma, categoria ou gênero válidos.');
        }

        $requestedIds = array_values(array_unique(array_filter(array_map('intval', $teamIds), static fn (int $id): bool => $id > 0)));
        $whereTeams = '';
        $params = [$editionId, $classId, $categoryId, $gender];
        $types = 'iii' . 's';
        if ($requestedIds !== []) {
            $marks = implode(',', array_fill(0, count($requestedIds), '?'));
            $whereTeams = " AND e.id_equipe IN ($marks)";
            $types .= str_repeat('i', count($requestedIds));
            $params = array_merge($params, $requestedIds);
        }
        $teams = $this->all("SELECT e.id_equipe, e.nome_equipe, e.modalidades_id_modalidade AS id_modalidade, m.nome_modalidade, m.genero_modalidade, m.categorias_id_categoria, c.nome_categoria, e.turmas_id_turma AS id_turma, t.nome_turma FROM equipes e INNER JOIN equipe_planejamentos ep ON ep.id_equipe = e.id_equipe AND ep.planejada = 1 INNER JOIN modalidades m ON m.id_modalidade = e.modalidades_id_modalidade AND m.interclasses_id_interclasse = ? AND m.status_modalidade = '1' INNER JOIN categorias c ON c.id_categoria = m.categorias_id_categoria INNER JOIN turmas t ON t.id_turma = e.turmas_id_turma WHERE e.status_equipe = '1' AND e.turmas_id_turma = ? AND m.categorias_id_categoria = ? AND (m.genero_modalidade = 'MISTO' OR m.genero_modalidade = ?)" . $whereTeams . ' ORDER BY m.id_modalidade, e.id_equipe', $types, $params);
        if ($requestedIds !== [] && count($teams) !== count($requestedIds)) {
            throw new InvalidArgumentException('Uma ou mais equipes não estão disponíveis para este aluno.');
        }

        $version = (int) $edition['versao_publicada'];
        $selectedIds = array_map(static fn (array $team): int => (int) $team['id_equipe'], $teams);
        if ($selectedIds === []) {
            return [
                'success' => true,
                'publicado' => true,
                'cronograma_status' => (string) $edition['cronograma_status'],
                'inscricoes_status' => (string) $edition['inscricoes_status'],
                'cronograma_versao' => (int) $edition['cronograma_versao'],
                'versao_publicada' => $version,
                'equipes' => [],
                'compromissos' => [],
                'avancos' => [],
            ];
        }

        $marks = implode(',', array_fill(0, count($selectedIds), '?'));
        $commitments = $this->all("SELECT DISTINCT cne.id_equipe, cc.id_compromisso, cc.id_modalidade, cc.chave_tag, DATE_FORMAT(cc.data_compromisso, '%Y-%m-%d') AS data_compromisso, TIME_FORMAT(cc.inicio_compromisso, '%H:%i:%s') AS inicio_compromisso, TIME_FORMAT(cc.termino_compromisso, '%H:%i:%s') AS termino_compromisso, cc.id_local, COALESCE(l.nome_local, 'A definir') AS nome_local, cc.condicional, cn.id_no, cn.tipo_no, cn.fase_largura, cn.slot, cn.origem_a_tag, cn.origem_b_tag, cn.id_equipe_a, cn.id_equipe_b, m.nome_modalidade FROM cronograma_compromissos cc INNER JOIN cronograma_nos cn ON cn.id_interclasse = cc.id_interclasse AND cn.id_modalidade = cc.id_modalidade AND cn.cronograma_versao = cc.cronograma_versao AND cn.chave_tag = cc.chave_tag INNER JOIN cronograma_no_equipes cne ON cne.id_no = cn.id_no AND cne.id_equipe IN ($marks) INNER JOIN modalidades m ON m.id_modalidade = cc.id_modalidade LEFT JOIN locais l ON l.id_local = cc.id_local WHERE cc.id_interclasse = ? AND cc.cronograma_versao = ? ORDER BY data_compromisso, inicio_compromisso, cc.id_modalidade, cn.fase_largura DESC, cn.slot", str_repeat('i', count($selectedIds)) . 'ii', array_merge($selectedIds, [$editionId, $version]));

        $nodeIds = array_values(array_unique(array_map(static fn (array $row): int => (int) $row['id_no'], $commitments)));
        $candidateMap = [];
        if ($nodeIds !== []) {
            $nodeMarks = implode(',', array_fill(0, count($nodeIds), '?'));
            $candidateRows = $this->all("SELECT cne.id_no, cne.id_equipe, e.nome_equipe FROM cronograma_no_equipes cne INNER JOIN equipes e ON e.id_equipe = cne.id_equipe WHERE cne.id_no IN ($nodeMarks) ORDER BY cne.id_no, cne.lado, cne.id_equipe", str_repeat('i', count($nodeIds)), $nodeIds);
            foreach ($candidateRows as $candidate) {
                $candidateMap[(int) $candidate['id_no']][] = [
                    'id_equipe' => (int) $candidate['id_equipe'],
                    'nome_equipe' => (string) $candidate['nome_equipe'],
                ];
            }
        }

        $agenda = [];
        foreach ($commitments as $commitment) {
            $teamId = (int) $commitment['id_equipe'];
            $candidates = $candidateMap[(int) $commitment['id_no']] ?? [];
            $opponents = array_values(array_filter($candidates, static fn (array $candidate): bool => $candidate['id_equipe'] !== $teamId));
            $agenda[] = [
                'id_compromisso' => (int) $commitment['id_compromisso'],
                'id_equipe' => $teamId,
                'id_modalidade' => (int) $commitment['id_modalidade'],
                'nome_modalidade' => (string) $commitment['nome_modalidade'],
                'chave_tag' => (string) $commitment['chave_tag'],
                'tipo_no' => (string) $commitment['tipo_no'],
                'fase_largura' => (int) $commitment['fase_largura'],
                'fase' => ChaveamentoRules::nomeFasePt((int) $commitment['fase_largura']),
                'slot' => (int) $commitment['slot'],
                'data_compromisso' => (string) $commitment['data_compromisso'],
                'inicio_compromisso' => (string) $commitment['inicio_compromisso'],
                'termino_compromisso' => (string) $commitment['termino_compromisso'],
                'id_local' => (int) $commitment['id_local'],
                'nome_local' => (string) $commitment['nome_local'],
                'condicional' => (bool) $commitment['condicional'],
                'oponentes_candidatos' => $opponents,
                'oponente' => count($opponents) === 1 ? (string) $opponents[0]['nome_equipe'] : 'A definir',
            ];
        }

        $byeNodes = $this->all("SELECT DISTINCT cne.id_equipe, cn.id_no, cn.id_modalidade, cn.chave_tag, cn.fase_largura, cn.slot, m.nome_modalidade FROM cronograma_nos cn INNER JOIN cronograma_no_equipes cne ON cne.id_no = cn.id_no AND cne.id_equipe IN ($marks) INNER JOIN modalidades m ON m.id_modalidade = cn.id_modalidade WHERE cn.id_interclasse = ? AND cn.cronograma_versao = ? AND cn.tipo_no = 'bye' ORDER BY cn.fase_largura DESC, cn.slot", str_repeat('i', count($selectedIds)) . 'ii', array_merge($selectedIds, [$editionId, $version]));
        $advances = array_map(static fn (array $bye): array => [
            'id_equipe' => (int) $bye['id_equipe'],
            'id_no' => (int) $bye['id_no'],
            'id_modalidade' => (int) $bye['id_modalidade'],
            'nome_modalidade' => (string) $bye['nome_modalidade'],
            'chave_tag' => (string) $bye['chave_tag'],
            'fase_largura' => (int) $bye['fase_largura'],
            'fase' => ChaveamentoRules::nomeFasePt((int) $bye['fase_largura']),
            'slot' => (int) $bye['slot'],
            'mensagem' => 'Avanço automático para a próxima fase',
        ], $byeNodes);

        return [
            'success' => true,
            'publicado' => true,
            'cronograma_status' => (string) $edition['cronograma_status'],
            'inscricoes_status' => (string) $edition['inscricoes_status'],
            'cronograma_versao' => (int) $edition['cronograma_versao'],
            'versao_publicada' => $version,
            'equipes' => $teams,
            'compromissos' => $agenda,
            'avancos' => $advances,
        ];
    }

    /** @param list<array<string,mixed>> $nodes */
    private function insertNodes(int $editionId, int $version, array $nodes): void
    {
        if ($nodes === []) {
            throw new InvalidArgumentException('A árvore do cronograma não pode ficar vazia.');
        }
        $mapping = $this->prepare('INSERT INTO cronograma_no_equipes (id_no, id_equipe, lado) VALUES (?, ?, ?)');
        $statementWithClass = null;
        $statementWithoutClass = null;
        foreach ($nodes as $node) {
            $modality = (int) ($node['id_modalidade'] ?? 0);
            $class = ($node['id_turma'] ?? null) === null || $node['id_turma'] === '' ? null : (int) $node['id_turma'];
            $tag = trim((string) ($node['chave_tag'] ?? ''));
            $kind = trim((string) ($node['tipo_no'] ?? ''));
            $width = (int) ($node['fase_largura'] ?? 0);
            $slot = (int) ($node['slot'] ?? 0);
            $teamA = isset($node['id_equipe_a']) ? (int) $node['id_equipe_a'] : null;
            $teamB = isset($node['id_equipe_b']) ? (int) $node['id_equipe_b'] : null;
            if ($modality <= 0 || ($class !== null && $class <= 0) || $tag === '' || !in_array($kind, ['normal', 'bye', 'individual'], true) || $width <= 0 || $slot < 0) {
                $mapping->close();
                throw new InvalidArgumentException('Nó do cronograma inválido.');
            }
            $originA = ($node['origem_a_tag'] ?? null) !== null ? trim((string) $node['origem_a_tag']) : null;
            $originB = ($node['origem_b_tag'] ?? null) !== null ? trim((string) $node['origem_b_tag']) : null;
            if ($class === null) {
                $statementWithoutClass ??= $this->prepare('INSERT INTO cronograma_nos (id_interclasse, id_modalidade, id_turma, chave_tag, tipo_no, fase_largura, slot, origem_a_tag, origem_b_tag, id_equipe_a, id_equipe_b, cronograma_versao) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                $statement = $statementWithoutClass;
                $statement->bind_param('iissiissiii', $editionId, $modality, $tag, $kind, $width, $slot, $originA, $originB, $teamA, $teamB, $version);
            } else {
                $statementWithClass ??= $this->prepare('INSERT INTO cronograma_nos (id_interclasse, id_modalidade, id_turma, chave_tag, tipo_no, fase_largura, slot, origem_a_tag, origem_b_tag, id_equipe_a, id_equipe_b, cronograma_versao) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                $statement = $statementWithClass;
                $statement->bind_param('iiissiissiii', $editionId, $modality, $class, $tag, $kind, $width, $slot, $originA, $originB, $teamA, $teamB, $version);
            }
            if (!$statement->execute()) {
                $error = $statement->error;
                $statementWithClass?->close();
                $statementWithoutClass?->close();
                $mapping->close();
                throw new RuntimeException($error !== '' ? $error : 'Não foi possível gravar os nós do cronograma.');
            }
            $nodeId = (int) $this->connection->insert_id;
            $teamIds = array_values(array_unique(array_filter(array_map('intval', is_array($node['equipe_ids'] ?? null) ? $node['equipe_ids'] : []), static fn (int $id): bool => $id > 0)));
            foreach ($teamIds as $teamId) {
                $side = $teamId === $teamA ? 'a' : ($teamId === $teamB ? 'b' : 'candidato');
                $mapping->bind_param('iis', $nodeId, $teamId, $side);
                if (!$mapping->execute()) {
                    $error = $mapping->error;
                    $statementWithClass?->close();
                    $statementWithoutClass?->close();
                    $mapping->close();
                    throw new RuntimeException($error !== '' ? $error : 'Não foi possível gravar as equipes candidatas do nó.');
                }
            }
        }
        $statementWithClass?->close();
        $statementWithoutClass?->close();
        $mapping->close();
    }

    private function insertCommitments(int $editionId, int $version, array $items): void
    {
        if ($items === []) {
            return;
        }
        $statement = $this->prepare('INSERT INTO cronograma_compromissos (id_interclasse, id_modalidade, id_equipe, chave_tag, data_compromisso, inicio_compromisso, termino_compromisso, id_local, condicional, cronograma_versao) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        foreach ($items as $item) {
            $modality = (int) ($item['id_modalidade'] ?? 0);
            $team = (int) ($item['id_equipe'] ?? 0);
            $tag = trim((string) ($item['chave_tag'] ?? ''));
            $date = trim((string) ($item['data_compromisso'] ?? $item['data'] ?? ''));
            $start = trim((string) ($item['inicio_compromisso'] ?? $item['inicio'] ?? ''));
            $end = trim((string) ($item['termino_compromisso'] ?? $item['fim'] ?? ''));
            $local = (int) ($item['id_local'] ?? 0);
            if ($modality <= 0 || $team <= 0 || $tag === '' || $local <= 0 || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || !preg_match('/^\d{2}:\d{2}(?::\d{2})?$/', $start) || !preg_match('/^\d{2}:\d{2}(?::\d{2})?$/', $end)) {
                $statement->close();
                throw new InvalidArgumentException('Compromisso do cronograma inválido.');
            }
            $check = $this->one('SELECT 1 FROM equipes e INNER JOIN modalidades m ON m.id_modalidade = e.modalidades_id_modalidade WHERE e.id_equipe = ? AND e.modalidades_id_modalidade = ? AND m.interclasses_id_interclasse = ? AND e.status_equipe = \'1\' LIMIT 1', 'iii', [$team, $modality, $editionId]);
            if ($check === null) {
                $statement->close();
                throw new InvalidArgumentException('A equipe do compromisso não pertence à modalidade e edição.');
            }
            if ($this->one('SELECT 1 FROM locais WHERE id_local = ? AND interclasses_id_interclasse = ? AND status_local = \'1\' AND disponivel_local = \'1\' LIMIT 1', 'ii', [$local, $editionId]) === null) {
                $statement->close();
                throw new InvalidArgumentException('O local do compromisso não pertence à edição ou está indisponível.');
            }
            $conditional = !empty($item['condicional']) ? 1 : 0;
            $statement->bind_param('iiissssiii', $editionId, $modality, $team, $tag, $date, $start, $end, $local, $conditional, $version);
            if (!$statement->execute()) {
                $statement->close();
                throw new RuntimeException('Não foi possível gravar o compromisso do cronograma.');
            }
        }
        $statement->close();
    }

    /** @param list<array<string,mixed>> $modalities @param list<array<string,mixed>> $items @param list<array<string,mixed>> $nodes */
    private function validateCommitments(int $editionId, array $modalities, array $items, array $nodes): void
    {
        if ($items === [] && $nodes === []) {
            throw new InvalidArgumentException('O cronograma precisa ter nós antes da publicação.');
        }
        $expectedTeamsByModality = $this->assertPreparedTeams($editionId, $modalities);
        $modalityIds = array_fill_keys(array_map(static fn (array $row): int => (int) $row['id_modalidade'], $modalities), true);
        $coveredModalities = [];
        $coveredTeamsByModality = [];
        $nodesByTag = [];
        $nodeCommitments = [];
        foreach ($nodes as $node) {
            $modalityId = (int) ($node['id_modalidade'] ?? 0);
            $classId = ($node['id_turma'] ?? null) === null || $node['id_turma'] === '' ? null : (int) $node['id_turma'];
            $tag = trim((string) ($node['chave_tag'] ?? ''));
            $kind = (string) ($node['tipo_no'] ?? '');
            $candidateIds = array_values(array_unique(array_filter(array_map('intval', is_array($node['equipe_ids'] ?? null) ? $node['equipe_ids'] : []), static fn (int $id): bool => $id > 0)));
            if (!isset($modalityIds[$modalityId]) || ($classId !== null && $classId <= 0) || $tag === '' || !in_array($kind, ['normal', 'bye', 'individual'], true) || $candidateIds === []) {
                throw new InvalidArgumentException('Cada nó deve apontar para uma modalidade e equipes candidatas válidas.');
            }
            if (isset($nodesByTag[$modalityId . ':' . $tag])) {
                throw new InvalidArgumentException('A árvore do cronograma contém nós duplicados.');
            }
            $nodesByTag[$modalityId . ':' . $tag] = $node + ['equipe_ids' => $candidateIds];
            $coveredModalities[$modalityId] = true;
            foreach ($candidateIds as $teamId) {
                $coveredTeamsByModality[$modalityId][$teamId] = true;
            }
        }
        foreach ($items as $item) {
            $modalityId = (int) ($item['id_modalidade'] ?? 0);
            $teamId = (int) ($item['id_equipe'] ?? 0);
            if (!isset($modalityIds[$modalityId]) || $teamId <= 0) {
                throw new InvalidArgumentException('Cada compromisso deve apontar para uma modalidade e equipe ativas.');
            }
            $coveredModalities[$modalityId] = true;
            $tag = trim((string) ($item['chave_tag'] ?? ''));
            $matches = array_filter($nodesByTag, static fn (array $node): bool => (int) ($node['id_modalidade'] ?? 0) === $modalityId && (string) ($node['chave_tag'] ?? '') === $tag);
            if ($matches === []) {
                throw new InvalidArgumentException('Cada compromisso deve referenciar um nó publicado.');
            }
            $node = array_values($matches)[0];
            if (($node['tipo_no'] ?? '') === 'bye' || !in_array($teamId, $node['equipe_ids'], true)) {
                throw new InvalidArgumentException('O compromisso não pertence às equipes candidatas do nó.');
            }
            $nodeKey = $modalityId . ':' . $tag;
            $nodeCommitments[$nodeKey] = ($nodeCommitments[$nodeKey] ?? 0) + 1;
        }
        foreach ($nodesByTag as $nodeKey => $node) {
            if (($node['tipo_no'] ?? '') !== 'bye' && ($nodeCommitments[$nodeKey] ?? 0) !== 1) {
                throw new InvalidArgumentException('Cada nó normal ou individual precisa de exatamente um compromisso.');
            }
            foreach (['origem_a_tag', 'origem_b_tag'] as $originKey) {
                $origin = $node[$originKey] ?? null;
                if ($origin !== null && !isset($nodesByTag[(int) $node['id_modalidade'] . ':' . (string) $origin])) {
                    throw new InvalidArgumentException('A árvore contém uma origem que não pertence à mesma modalidade.');
                }
            }
        }
        foreach (array_keys($modalityIds) as $modalityId) {
            if (!isset($coveredModalities[$modalityId])) {
                throw new InvalidArgumentException('Todas as modalidades ativas precisam estar cobertas pelo cronograma.');
            }
        }
        foreach ($expectedTeamsByModality as $modalityId => $expectedTeams) {
            $expectedTeamIds = array_map(static fn (array $team): int => (int) $team['id_equipe'], $expectedTeams);
            $coveredTeamIds = array_map('intval', array_keys($coveredTeamsByModality[$modalityId] ?? []));
            sort($expectedTeamIds, SORT_NUMERIC);
            sort($coveredTeamIds, SORT_NUMERIC);
            if ($coveredTeamIds !== $expectedTeamIds) {
                throw new InvalidArgumentException('O rascunho não cobre exatamente as equipes ativas preparadas. Prepare as equipes e gere um novo rascunho.');
            }
        }
        foreach ($items as $index => $first) {
            foreach (array_slice($items, $index + 1) as $second) {
                $firstNode = $this->nodeForCommitment($nodesByTag, $first);
                $secondNode = $this->nodeForCommitment($nodesByTag, $second);
                $sameTeam = array_intersect($firstNode['equipe_ids'] ?? [(int) ($first['id_equipe'] ?? 0)], $secondNode['equipe_ids'] ?? [(int) ($second['id_equipe'] ?? 0)]) !== [];
                $sameLocal = (int) ($first['id_local'] ?? 0) === (int) ($second['id_local'] ?? 0);
                $studentOverlap = CronogramaRules::schedulesConflict($first, $second);
                if ($studentOverlap && $this->hasEnrolledStudentConflict(
                    $firstNode['equipe_ids'] ?? [(int) ($first['id_equipe'] ?? 0)],
                    $secondNode['equipe_ids'] ?? [(int) ($second['id_equipe'] ?? 0)],
                )) {
                    throw new InvalidArgumentException('O cronograma conflita inscrições existentes de um mesmo aluno.');
                }
                $margin = $sameLocal ? 10 : 0;
                if (($sameTeam || $sameLocal) && CronogramaRules::schedulesConflict($first, $second, $margin)) {
                    throw new InvalidArgumentException('O cronograma possui conflito de equipe ou local entre compromissos.');
                }
            }
        }
    }

    /** @param list<array<string,mixed>> $modalities @return array<int, list<array<string,mixed>>> */
    private function assertPreparedTeams(int $editionId, array $modalities): array
    {
        $prepared = [];
        foreach ($modalities as $modality) {
            $modalityId = (int) ($modality['id_modalidade'] ?? 0);
            $quantity = (int) ($modality['equipes_planejadas'] ?? 0);
            $minimum = (int) ($modality['min_inscritos_equipe'] ?? 0);
            $maximum = (int) ($modality['max_inscritos_equipe'] ?? 0);
            if ($modalityId <= 0 || $quantity <= 0 || $minimum <= 0 || $maximum < $minimum) {
                throw new InvalidArgumentException('Configure os limites e a quantidade de equipes de cada modalidade antes de gerar a agenda.');
            }
            $classes = $this->all('SELECT id_turma FROM turmas WHERE interclasses_id_interclasse = ? AND categorias_id_categoria = ? AND status_turma = \'1\' ORDER BY id_turma', 'ii', [$editionId, (int) ($modality['categorias_id_categoria'] ?? 0)]);
            if ($classes === []) {
                throw new InvalidArgumentException('A modalidade não possui turmas ativas na categoria selecionada. Revise a categoria antes de gerar a agenda.');
            }
            $teams = $this->all('SELECT e.id_equipe, e.turmas_id_turma AS id_turma, ep.ordem_planejada, ep.planejada, ep.min_inscritos, ep.max_inscritos FROM equipes e INNER JOIN turmas t ON t.id_turma = e.turmas_id_turma LEFT JOIN equipe_planejamentos ep ON ep.id_equipe = e.id_equipe WHERE e.modalidades_id_modalidade = ? AND t.categorias_id_categoria = ? AND t.interclasses_id_interclasse = ? AND e.status_equipe = \'1\' AND t.status_turma = \'1\' ORDER BY t.id_turma, ep.ordem_planejada, e.id_equipe', 'iii', [$modalityId, (int) $modality['categorias_id_categoria'], $editionId]);
            $byClass = [];
            foreach ($teams as $team) {
                $byClass[(int) $team['id_turma']][] = $team;
            }
            foreach ($classes as $class) {
                $classId = (int) $class['id_turma'];
                $classTeams = $byClass[$classId] ?? [];
                if (count($classTeams) !== $quantity) {
                    throw new InvalidArgumentException('A quantidade de equipes preparadas não corresponde à configuração atual. Use Preparar equipes e gere um novo rascunho.');
                }
                foreach ($classTeams as $team) {
                    if ((int) ($team['planejada'] ?? 0) !== 1
                        || (int) ($team['min_inscritos'] ?? 0) !== $minimum
                        || (int) ($team['max_inscritos'] ?? 0) !== $maximum) {
                        throw new InvalidArgumentException('Os limites das equipes preparadas estão desatualizados. Use Preparar equipes e gere um novo rascunho.');
                    }
                }
            }
            $prepared[$modalityId] = $teams;
        }
        return $prepared;
    }

    /** @param list<array<string,mixed>> $items */
    private function assertNoExternalCommitmentConflicts(int $editionId, array $items): void
    {
        foreach ($items as $item) {
            $date = trim((string) ($item['data_compromisso'] ?? $item['data'] ?? ''));
            $start = trim((string) ($item['inicio_compromisso'] ?? $item['inicio'] ?? ''));
            $end = trim((string) ($item['termino_compromisso'] ?? $item['fim'] ?? ''));
            $local = (int) ($item['id_local'] ?? 0);
            if ($local <= 0 || !preg_match('/^\\d{4}-\\d{2}-\\d{2}$/', $date) || !preg_match('/^\\d{2}:\\d{2}(?::\\d{2})?$/', $start) || !preg_match('/^\\d{2}:\\d{2}(?::\\d{2})?$/', $end)) {
                throw new InvalidArgumentException('Compromisso do cronograma inválido. Gere um novo rascunho.');
            }
            CronogramaRules::overlap($date, $start, $end, $date, $start, $end);
            MysqliLocalScheduleGuard::assertLocalBelongsToEdition($this->connection, $local, $editionId);
            $reservation = $this->one("SELECT id_reserva AS id, chave_tag AS nome FROM agenda_reservas WHERE id_interclasse = ? AND data_reserva = ? AND id_local = ? AND ? < ADDTIME(termino_reserva, '00:10:00') AND ADDTIME(?, '00:10:00') > inicio_reserva LIMIT 1 FOR UPDATE", 'isiss', [$editionId, $date, $local, $start, $end]);
            if ($reservation !== null) {
                throw new InvalidArgumentException('Uma reserva independente ocupa este local e horário. Atualize a agenda e gere um novo rascunho.');
            }
            $game = $this->one("SELECT j.id_jogo AS id, j.nome_jogo AS nome FROM jogos j INNER JOIN modalidades m ON m.id_modalidade = j.modalidades_id_modalidade WHERE m.interclasses_id_interclasse = ? AND DATE(j.data_jogo) = ? AND j.locais_id_local = ? AND ? < ADDTIME(j.termino_jogo, '00:10:00') AND ADDTIME(?, '00:10:00') > j.inicio_jogo LIMIT 1 FOR UPDATE", 'isiss', [$editionId, $date, $local, $start, $end]);
            if ($game !== null) {
                throw new InvalidArgumentException('Um jogo existente ocupa este local e horário. Atualize a agenda e gere um novo rascunho.');
            }
        }
    }

    /** @param array<string,array<string,mixed>> $nodesByTag @return array<string,mixed> */
    private function nodeForCommitment(array $nodesByTag, array $commitment): array
    {
        $modality = (int) ($commitment['id_modalidade'] ?? 0);
        $tag = (string) ($commitment['chave_tag'] ?? '');
        foreach ($nodesByTag as $node) {
            if ((int) ($node['id_modalidade'] ?? 0) === $modality && (string) ($node['chave_tag'] ?? '') === $tag) {
                return $node;
            }
        }
        return ['equipe_ids' => [(int) ($commitment['id_equipe'] ?? 0)]];
    }

    /** @param list<int> $firstTeams @param list<int> $secondTeams */
    private function hasEnrolledStudentConflict(array $firstTeams, array $secondTeams): bool
    {
        $firstTeams = array_values(array_unique(array_filter(array_map('intval', $firstTeams), static fn (int $id): bool => $id > 0)));
        $secondTeams = array_values(array_unique(array_filter(array_map('intval', $secondTeams), static fn (int $id): bool => $id > 0)));
        if ($firstTeams === [] || $secondTeams === []) {
            return false;
        }
        $firstMarks = implode(',', array_fill(0, count($firstTeams), '?'));
        $secondMarks = implode(',', array_fill(0, count($secondTeams), '?'));
        $types = str_repeat('i', count($firstTeams) + count($secondTeams));
        return $this->one(
            "SELECT 1 FROM equipes_has_usuarios a INNER JOIN equipes_has_usuarios b ON b.usuarios_id_usuario = a.usuarios_id_usuario WHERE a.equipes_id_equipe IN ($firstMarks) AND b.equipes_id_equipe IN ($secondMarks) AND a.equipes_id_equipe <> b.equipes_id_equipe LIMIT 1",
            $types,
            array_merge($firstTeams, $secondTeams),
        ) !== null;
    }

    private function lockEdition(int $editionId): array
    {
        $edition = $this->one('SELECT id_interclasse, cronograma_status, inscricoes_status, cronograma_versao, versao_publicada, operacao_liberada, inscricoes_abertura, inscricoes_encerramento FROM interclasse_planejamentos WHERE id_interclasse = ? LIMIT 1 FOR UPDATE', 'i', [$editionId]);
        if ($edition === null) {
            throw new InvalidArgumentException('Edição não encontrada.');
        }
        return $edition;
    }

    /** @return array<string,mixed> */
    private function lockEditionForRead(int $editionId): array
    {
        $edition = $this->one('SELECT id_interclasse, cronograma_status, inscricoes_status, cronograma_versao, versao_publicada, operacao_liberada, inscricoes_abertura, inscricoes_encerramento FROM interclasse_planejamentos WHERE id_interclasse = ? LIMIT 1', 'i', [$editionId]);
        if ($edition === null) {
            throw new InvalidArgumentException('Edição sem planejamento migrado ou não encontrada.');
        }
        return $edition;
    }

    /** @return list<int> */
    private function planningLocalIds(int $editionId, mixed $requested): array
    {
        $ids = is_array($requested) ? array_values(array_unique(array_filter(array_map('intval', $requested), static fn (int $id): bool => $id > 0))) : [];
        if ($ids === []) {
            $rows = $this->all('SELECT id_local FROM locais WHERE interclasses_id_interclasse = ? AND status_local = \'1\' AND disponivel_local = \'1\' ORDER BY id_local', 'i', [$editionId]);
            return array_map(static fn (array $row): int => (int) $row['id_local'], $rows);
        }
        $marks = implode(',', array_fill(0, count($ids), '?'));
        $rows = $this->all('SELECT id_local FROM locais WHERE interclasses_id_interclasse = ? AND status_local = \'1\' AND disponivel_local = \'1\' AND id_local IN (' . $marks . ') ORDER BY id_local', 'i' . str_repeat('i', count($ids)), array_merge([$editionId], $ids));
        $valid = array_map(static fn (array $row): int => (int) $row['id_local'], $rows);
        if (count($valid) !== count($ids)) {
            throw new InvalidArgumentException('Um ou mais locais não pertencem à edição ou estão indisponíveis.');
        }
        return $valid;
    }

    /** @return array{0:\DateTimeImmutable,1:int,2:string,3:string,4:string,5:int}|null */
    private function nextDraftSlot(\DateTimeImmutable $cursor, \DateTimeImmutable $lastDate, int $duration, int $gap, array $localIds, int $localIndex, string $dayStart, string $dayEnd, array $occupied = []): ?array
    {
        for ($attempt = 0; $attempt < 10000; $attempt++) {
            $dayStartAt = new \DateTimeImmutable($cursor->format('Y-m-d') . ' ' . $dayStart);
            $dayEndAt = new \DateTimeImmutable($cursor->format('Y-m-d') . ' ' . $dayEnd);
            if ($cursor < $dayStartAt) {
                $cursor = $dayStartAt;
            }
            $end = $cursor->modify('+' . $duration . ' minutes');
            if ($end > $dayEndAt) {
                $nextDay = $cursor->modify('+1 day')->setTime((int) $dayStartAt->format('H'), (int) $dayStartAt->format('i'));
                if ($nextDay > $lastDate) {
                    return null;
                }
                $cursor = $nextDay;
                continue;
            }
            if ($end > $lastDate) {
                return null;
            }
            $date = $cursor->format('Y-m-d');
            $start = $cursor->format('H:i:s');
            $endTime = $end->format('H:i:s');
            $localCount = count($localIds);
            $nextAvailable = null;
            for ($offset = 0; $offset < $localCount; $offset++) {
                $candidateIndex = $localIndex + $offset;
                $local = $localIds[$candidateIndex % $localCount];
                $conflict = false;
                foreach ($occupied as $reserved) {
                    if ((int) ($reserved['local'] ?? 0) !== $local || (string) ($reserved['data'] ?? '') !== $date) {
                        continue;
                    }
                    if (CronogramaRules::overlap($date, $start, $endTime, $date, (string) ($reserved['inicio'] ?? ''), (string) ($reserved['termino'] ?? ''), 10)) {
                        $conflict = true;
                        $reservedEnd = new \DateTimeImmutable($date . ' ' . (string) $reserved['termino']);
                        $afterReservation = $reservedEnd->modify('+10 minutes');
                        if ($nextAvailable === null || $afterReservation < $nextAvailable) {
                            $nextAvailable = $afterReservation;
                        }
                    }
                }
                if (!$conflict) {
                    $next = $end->modify('+' . $gap . ' minutes');
                    return [$next, $candidateIndex + 1, $date, $start, $endTime, $local];
                }
            }
            $cursor = $nextAvailable !== null && $nextAvailable > $cursor
                ? $nextAvailable
                : $cursor->modify('+1 minute');
            $localIndex = 0;
        }
        return null;
    }

    /** @return list<array{data:string,inicio:string,termino:string,local:int}> */
    private function occupiedSlots(int $editionId, int $version, ?int $replacedVersion = null): array
    {
        $plannedExclusion = $replacedVersion === null ? '' : ' AND cronograma_versao <> ?';
        $types = 'iiii' . ($replacedVersion === null ? '' : 'i');
        $params = [$editionId, $editionId, $version];
        if ($replacedVersion !== null) {
            $params[] = $replacedVersion;
        }
        $params[] = $editionId;
        $rows = $this->all("SELECT DATE_FORMAT(data_reserva, '%Y-%m-%d') AS data, TIME_FORMAT(inicio_reserva, '%H:%i:%s') AS inicio, TIME_FORMAT(termino_reserva, '%H:%i:%s') AS termino, id_local AS local FROM agenda_reservas WHERE id_interclasse = ? AND data_reserva IS NOT NULL AND inicio_reserva IS NOT NULL AND termino_reserva IS NOT NULL AND id_local IS NOT NULL UNION ALL SELECT DATE_FORMAT(data_compromisso, '%Y-%m-%d') AS data, TIME_FORMAT(inicio_compromisso, '%H:%i:%s') AS inicio, TIME_FORMAT(termino_compromisso, '%H:%i:%s') AS termino, id_local AS local FROM cronograma_compromissos WHERE id_interclasse = ? AND cronograma_versao = ?{$plannedExclusion} UNION ALL SELECT DATE_FORMAT(j.data_jogo, '%Y-%m-%d') AS data, TIME_FORMAT(j.inicio_jogo, '%H:%i:%s') AS inicio, TIME_FORMAT(j.termino_jogo, '%H:%i:%s') AS termino, j.locais_id_local AS local FROM jogos j INNER JOIN modalidades m ON m.id_modalidade = j.modalidades_id_modalidade WHERE m.interclasses_id_interclasse = ? AND j.data_jogo IS NOT NULL AND j.inicio_jogo IS NOT NULL AND j.termino_jogo IS NOT NULL AND j.locais_id_local IS NOT NULL", $types, $params);
        return array_map(static fn (array $row): array => ['data' => (string) $row['data'], 'inicio' => (string) $row['inicio'], 'termino' => (string) $row['termino'], 'local' => (int) $row['local']], $rows);
    }

    private function positiveOption(mixed $value, string $label): int
    {
        $number = filter_var($value, FILTER_VALIDATE_INT);
        if ($number === false || $number <= 0) {
            throw new InvalidArgumentException($label . ' deve ser um inteiro positivo.');
        }
        return (int) $number;
    }

    private function nonNegativeOption(mixed $value, string $label): int
    {
        $number = filter_var($value, FILTER_VALIDATE_INT);
        if ($number === false || $number < 0) {
            throw new InvalidArgumentException($label . ' deve ser um inteiro não negativo.');
        }
        return (int) $number;
    }

    private function assertRevision(array $edition, int $expected): void
    {
        if ((int) $edition['cronograma_versao'] !== $expected) {
            throw new InvalidArgumentException('O cronograma foi alterado. Atualize a página e tente novamente.');
        }
    }

    /** @return list<array<string,mixed>> */
    private function all(string $sql, string $types, array $params): array
    {
        $statement = $this->prepare($sql);
        $statement->bind_param($types, ...$params);
        if (!$statement->execute()) {
            $error = $statement->error;
            $statement->close();
            throw new RuntimeException($error !== '' ? $error : 'Não foi possível consultar o cronograma.');
        }
        $rows = $statement->get_result()->fetch_all(MYSQLI_ASSOC);
        $statement->close();
        return $rows;
    }

    /** @return array<string,mixed>|null */
    private function one(string $sql, string $types, array $params): ?array
    {
        $rows = $this->all($sql, $types, $params);
        return $rows[0] ?? null;
    }

    private function prepare(string $sql): \mysqli_stmt
    {
        $statement = $this->connection->prepare($sql);
        if ($statement === false) {
            throw new RuntimeException('Não foi possível preparar operação do cronograma.');
        }
        return $statement;
    }
}
