<?php

declare(strict_types=1);

namespace App\Modules\Competicoes\Application;

use App\Modules\Competicoes\Domain\ModalidadeRepository;
use App\Modules\Competicoes\Domain\CronogramaRules;
use InvalidArgumentException;

final class ModalidadeService
{
    private const MAX_LIMIT = 2147483647;

    public function __construct(private readonly ModalidadeRepository $modalidades)
    {
    }

    /**
     * @param array<string, mixed> $filters
     * @return list<array<string, mixed>>
     */
    public function listar(array $filters): array
    {
        return $this->modalidades->list($filters);
    }

    /**
     * @param array<string, mixed> $data
     */
    public function criar(array $data): int
    {
        $nome = trim((string) ($data['nome_modalidade'] ?? ''));
        $tipoId = (int) ($data['tipos_modalidades_id_tipo_modalidade'] ?? 0);
        $categoriaId = (int) ($data['categorias_id_categoria'] ?? 0);
        $interclasseId = (int) ($data['interclasses_id_interclasse'] ?? 0);
        if ($nome === '' || $tipoId <= 0 || $categoriaId <= 0 || $interclasseId <= 0) {
            throw new InvalidArgumentException('Dados incompletos.');
        }

        $maxInscritos = self::normalizarLimite($data['max_inscrito_modalidade'] ?? null) ?? 0;
        $maxEquipes = self::normalizarLimite($data['max_equipes'] ?? null);
        $planned = $this->plannedFields($data);
        if (isset($planned['equipes_planejadas'])) {
            $maxEquipes = (int) $planned['equipes_planejadas'];
        }
        return $this->modalidades->create([
            'nome_modalidade' => $nome,
            'genero_modalidade' => $this->normalizarGenero((string) ($data['genero_modalidade'] ?? '')),
            'max_inscrito_modalidade' => $maxInscritos,
            'max_equipes' => $maxEquipes,
            ...$planned,
            'tipos_modalidades_id_tipo_modalidade' => $tipoId,
            'status_modalidade' => self::normalizarStatus(array_key_exists('status_modalidade', $data) ? $data['status_modalidade'] : '1'),
            'categorias_id_categoria' => $categoriaId,
            'interclasses_id_interclasse' => $interclasseId,
        ]);
    }

    /**
     * @param array<string, mixed> $data
     */
    public function atualizar(array $data): void
    {
        $id = (int) ($data['id_modalidade'] ?? 0);
        if ($id <= 0) {
            throw new InvalidArgumentException('O ID da modalidade é obrigatório.');
        }
        $updates = [];
        foreach (['nome_modalidade', 'status_modalidade', 'tipos_modalidades_id_tipo_modalidade', 'categorias_id_categoria', 'interclasses_id_interclasse'] as $field) {
            if (array_key_exists($field, $data)) {
                $value = $data[$field];
                if ($field === 'nome_modalidade') {
                    $value = trim((string) $value);
                    if ($value === '') {
                        throw new InvalidArgumentException('O nome da modalidade não pode ser vazio.');
                    }
                } elseif ($field === 'status_modalidade') {
                    $value = self::normalizarStatus($value);
                } else {
                    $value = (int) $value;
                    if ($value <= 0) {
                        throw new InvalidArgumentException('Os vínculos da modalidade devem ser válidos.');
                    }
                }
                $updates[$field] = $value;
            }
        }
        if (array_key_exists('genero_modalidade', $data)) {
            $updates['genero_modalidade'] = $this->normalizarGenero((string) $data['genero_modalidade']);
        }
        if (array_key_exists('max_inscrito_modalidade', $data)) {
            $updates['max_inscrito_modalidade'] = self::normalizarLimite($data['max_inscrito_modalidade']) ?? 0;
        }
        if (array_key_exists('max_equipes', $data)) {
            $updates['max_equipes'] = self::normalizarLimite($data['max_equipes']);
        }
        $updates = array_merge($updates, $this->plannedFields($data, false));
        if (array_key_exists('equipes_planejadas', $updates)) {
            $updates['max_equipes'] = (int) $updates['equipes_planejadas'];
        }
        if ($updates === []) {
            throw new InvalidArgumentException('Nenhum dado fornecido para atualização.');
        }
        if (!$this->modalidades->update($id, $updates)) {
            throw new ModalidadeNaoEncontradaException();
        }
    }

    public function excluir(int $id): void
    {
        if ($id <= 0) {
            throw new InvalidArgumentException('O ID da modalidade é obrigatório.');
        }
        if (!$this->modalidades->deactivate($id)) {
            throw new ModalidadeNaoEncontradaException();
        }
    }

    private static function normalizarLimite(mixed $value): ?int
    {
        if ($value === null) {
            return null;
        }

        if (is_int($value)) {
            $number = $value;
        } elseif (is_string($value)) {
            $digits = trim($value);
            if ($digits === '') {
                return null;
            }
            if (preg_match('/^[0-9]+$/D', $digits) !== 1) {
                throw new InvalidArgumentException('Os limites da modalidade devem ser números inteiros não negativos.');
            }
            $digits = ltrim($digits, '0');
            $digits = $digits === '' ? '0' : $digits;
            if (strlen($digits) > 10 || (strlen($digits) === 10 && strcmp($digits, (string) self::MAX_LIMIT) > 0)) {
                throw new InvalidArgumentException('Os limites da modalidade excedem o máximo permitido.');
            }
            $number = (int) $digits;
        } else {
            throw new InvalidArgumentException('Os limites da modalidade devem ser números inteiros não negativos.');
        }

        if ($number < 0) {
            throw new InvalidArgumentException('Os limites da modalidade não podem ser negativos.');
        }
        if ($number > self::MAX_LIMIT) {
            throw new InvalidArgumentException('Os limites da modalidade excedem o máximo permitido.');
        }

        return $number === 0 ? null : $number;
    }

    private static function normalizarStatus(mixed $status): string
    {
        if (is_int($status) && ($status === 0 || $status === 1)) {
            return (string) $status;
        }
        if (is_string($status) && in_array($status, ['0', '1'], true)) {
            return $status;
        }

        throw new InvalidArgumentException('Status da modalidade inválido.');
    }

    private function normalizarGenero(string $genero): string
    {
        return match (strtoupper(trim($genero))) {
            'M', 'MAS', 'MASC', 'MASCULINO' => 'MASC',
            'F', 'FEM', 'FEMININO' => 'FEM',
            'MISTO', 'MIXTO', 'MIX' => 'MISTO',
            default => throw new InvalidArgumentException('Gênero da modalidade inválido.'),
        };
    }

    /** @return array<string,mixed> */
    private function plannedFields(array $data, bool $creating = true): array
    {
        $fields = ['equipes_planejadas', 'min_inscritos_equipe', 'max_inscritos_equipe', 'formato_participacao', 'duracao_prevista_min', 'descanso_min'];
        $present = array_intersect($fields, array_keys($data));
        if ($present === []) {
            return [];
        }
        if (!$creating && count(array_diff($fields, $present)) > 0) {
            // Atualização parcial: a infraestrutura revalida o estado final.
            return array_reduce($present, static function (array $carry, string $field) use ($data): array {
                $carry[$field] = $data[$field];
                return $carry;
            }, []);
        }
        $config = CronogramaRules::modalidade($data);
        return [
            'equipes_planejadas' => $config['quantidade'],
            'min_inscritos_equipe' => $config['min'],
            'max_inscritos_equipe' => $config['max'],
            'formato_participacao' => $config['formato'],
            'duracao_prevista_min' => $config['duracao'],
            'descanso_min' => $config['descanso'],
        ];
    }
}
