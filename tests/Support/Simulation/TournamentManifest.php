<?php
declare(strict_types=1);

namespace Tests\Support\Simulation;

use InvalidArgumentException;
use RuntimeException;

/** Deterministic test data and independently computed enrollment expectations. */
final class TournamentManifest
{
    /** @param array<string,mixed> $data */
    private function __construct(private readonly array $data)
    {
    }

    public static function load(?string $path = null): self
    {
        $file = $path ?? dirname(__DIR__, 2) . '/fixtures/simulacao-interclasse/manifest.json';
        $contents = @file_get_contents($file);
        if ($contents === false) {
            throw new RuntimeException('Não foi possível ler o manifesto da simulação integral.');
        }

        $data = json_decode($contents, true, 64, JSON_THROW_ON_ERROR);
        if (!is_array($data)) {
            throw new InvalidArgumentException('O manifesto da simulação deve ser um objeto JSON.');
        }

        self::validate($data);
        return new self($data);
    }

    /** @return list<array{alias:string,category:string}> */
    public function classes(): array
    {
        return $this->data['classes'];
    }

    /** @return list<array<string,mixed>> */
    public function modalities(): array
    {
        return $this->data['modalities'];
    }

    /** @return array<string,int> */
    public function summary(): array
    {
        $counts = [];
        $classCount = count($this->classes());
        for ($studentId = 1; $studentId <= (int) $this->data['students_per_class']; $studentId++) {
            $enrollmentCount = 0;
            foreach ($this->modalities() as $modality) {
                if (in_array($studentId, $modality['student_ids'], true)) {
                    $enrollmentCount++;
                }
            }
            $counts[$enrollmentCount] = ($counts[$enrollmentCount] ?? 0) + $classCount;
        }

        ksort($counts, SORT_NUMERIC);
        $enrollments = 0;
        foreach ($counts as $modalityCount => $students) {
            $enrollments += $modalityCount * $students;
        }

        return [
            'classes' => $classCount,
            'students_per_class' => (int) $this->data['students_per_class'],
            'students' => $classCount * (int) $this->data['students_per_class'],
            'modalities' => count($this->modalities()) * count(array_unique(array_column($this->classes(), 'category'))),
            'teams' => $classCount * count($this->modalities()),
            'enrollments' => $enrollments,
            'students_by_modality_count' => $counts,
        ];
    }

    /** @return array<int,int> cumulative registrations after enrollment rounds 1, 2, and 3 */
    public function cumulativeEnrollmentWaveCounts(): array
    {
        $roundCounts = [1 => 0, 2 => 0, 3 => 0];
        foreach ($this->classes() as $_class) {
            for ($studentId = 1; $studentId <= (int) $this->data['students_per_class']; $studentId++) {
                $selectedCount = 0;
                foreach ($this->modalities() as $modality) {
                    if (in_array($studentId, $modality['student_ids'], true)) {
                        $selectedCount++;
                    }
                }
                for ($round = 1; $round <= min(3, $selectedCount); $round++) {
                    $roundCounts[$round]++;
                }
            }
        }

        $cumulative = [];
        $total = 0;
        foreach ($roundCounts as $round => $count) {
            $total += $count;
            $cumulative[$round] = $total;
        }
        return $cumulative;
    }

    /** @return array<string,mixed> */
    public function expected(): array
    {
        return $this->data['expected'];
    }

    /** @return array<string,int> */
    public function expectedNetPointsByClass(): array
    {
        $sports = $this->expected()['sports_points_by_class'] ?? null;
        $fundraising = $this->expected()['fundraising_points_by_class'] ?? null;
        $penalty = (int) ($this->expected()['penalty_points_per_class'] ?? 0);
        if (!is_array($sports) || !is_array($fundraising) || $penalty < 0) {
            throw new InvalidArgumentException('O manifesto precisa declarar o oráculo de pontos por turma.');
        }

        $net = [];
        foreach ($this->classes() as $class) {
            $alias = $class['alias'];
            if (!array_key_exists($alias, $sports) || !array_key_exists($alias, $fundraising)) {
                throw new InvalidArgumentException("O oráculo não contém a turma {$alias}.");
            }
            $net[$alias] = (int) $sports[$alias] + (int) $fundraising[$alias] - $penalty;
        }
        return $net;
    }

    /** @return list<int> */
    public function modalityStudentIds(array $modality): array
    {
        return array_values(array_map('intval', $modality['student_ids']));
    }

    /** @param array<string,mixed> $data */
    private static function validate(array $data): void
    {
        if (($data['schema_version'] ?? null) !== 1
            || trim((string) ($data['seed'] ?? '')) === ''
            || trim((string) ($data['timezone'] ?? '')) === '') {
            throw new InvalidArgumentException('Versão, semente e fuso do manifesto são obrigatórios.');
        }
        $studentsPerClass = filter_var($data['students_per_class'] ?? null, FILTER_VALIDATE_INT);
        $classes = $data['classes'] ?? null;
        $modalities = $data['modalities'] ?? null;
        if ($studentsPerClass !== 32 || !is_array($classes) || $classes === [] || !is_array($modalities) || $modalities === []) {
            throw new InvalidArgumentException('Informe salas, modalidades e exatamente 32 alunos por sala.');
        }

        $classAliases = [];
        foreach ($classes as $class) {
            if (!is_array($class) || trim((string) ($class['alias'] ?? '')) === ''
                || !in_array($class['category'] ?? null, ['I', 'II'], true)
                || isset($classAliases[$class['alias']])) {
                throw new InvalidArgumentException('As salas precisam de aliases únicos e uma categoria válida.');
            }
            $classAliases[$class['alias']] = true;
        }

        $requiredClasses = $data['required_classes'] ?? [];
        if (!is_array($requiredClasses)
            || array_filter($requiredClasses, static fn (mixed $alias): bool => !is_string($alias) || !isset($classAliases[$alias])) !== []) {
            throw new InvalidArgumentException('O manifesto omite uma das turmas obrigatórias.');
        }

        $modalityAliases = [];
        foreach ($modalities as $modality) {
            if (!is_array($modality) || trim((string) ($modality['alias'] ?? '')) === ''
                || trim((string) ($modality['name'] ?? '')) === ''
                || !in_array($modality['gender'] ?? null, ['MASC', 'FEM', 'MISTO'], true)
                || isset($modalityAliases[$modality['alias']])) {
                throw new InvalidArgumentException('Cada modalidade precisa de alias, nome, gênero e identidade únicos.');
            }
            $modalityAliases[$modality['alias']] = true;
            $students = $modality['student_ids'] ?? null;
            if (!is_array($students) || count($students) !== count(array_unique($students))
                || array_filter($students, static fn (mixed $id): bool => !is_int($id) || $id < 1 || $id > $studentsPerClass) !== []) {
                throw new InvalidArgumentException('A lista de participantes da modalidade contém IDs inválidos ou duplicados.');
            }
            if (count($students) < (int) ($modality['min_team_size'] ?? 0)
                || count($students) > (int) ($modality['max_team_size'] ?? 0)) {
                throw new InvalidArgumentException('O elenco planejado está fora dos limites declarados.');
            }
        }

        foreach ($classes as $class) {
            $genders = $data['gender_ranges'] ?? [];
            if (!is_array($genders) || !isset($genders['MASC'], $genders['FEM'])) {
                throw new InvalidArgumentException('O manifesto deve declarar faixas de gênero sintéticas.');
            }
            foreach ($modalities as $modality) {
                $ids = $modality['student_ids'];
                $compatible = static function (int $studentId, string $gender) use ($genders): bool {
                    [$minimum, $maximum] = $genders[$gender];
                    return $studentId >= $minimum && $studentId <= $maximum;
                };
                foreach ($ids as $studentId) {
                    if ($modality['gender'] === 'MISTO'
                        || $compatible($studentId, $modality['gender'])) {
                        continue;
                    }
                    throw new InvalidArgumentException('A composição sintética da modalidade não corresponde ao gênero exigido.');
                }
            }
        }
    }
}
