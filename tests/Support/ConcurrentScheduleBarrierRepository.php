<?php

declare(strict_types=1);

namespace SGITests\Support;

use App\Modules\Competicoes\Domain\JogoRepository;
use RuntimeException;

/** Pauses after the initial conflict query so independent workers can race. */
final class ConcurrentScheduleBarrierRepository implements JogoRepository
{
    private bool $paused = false;

    public function __construct(
        private readonly JogoRepository $inner,
        private readonly string $barrier,
        private readonly string $workerId,
    ) {
    }

    public function localConflict(string $date, int $localId, string $start, string $end, ?int $currentId = null): ?string
    {
        $conflict = $this->inner->localConflict($date, $localId, $start, $end, $currentId);
        if (!$this->paused && $conflict === null) {
            $marker = $this->barrier . DIRECTORY_SEPARATOR . 'validated-' . $this->workerId;
            $tmp = $marker . '.tmp.' . getmypid() . '.' . bin2hex(random_bytes(4));
            if (@file_put_contents($tmp, 'no-conflict', LOCK_EX) === false || !@rename($tmp, $marker)) {
                @unlink($tmp);
                throw new RuntimeException('Não foi possível sinalizar a validação de conflito do agendamento.');
            }
            $deadline = microtime(true) + 10.0;
            while (!is_file($this->barrier . DIRECTORY_SEPARATOR . 'continue') && microtime(true) < $deadline) {
                usleep(10000);
            }
            if (!is_file($this->barrier . DIRECTORY_SEPARATOR . 'continue')) {
                throw new RuntimeException('A barreira do agendamento não foi liberada.');
            }
            $this->paused = true;
        }

        return $conflict;
    }

    public function create(array $data): int
    {
        return $this->inner->create($data);
    }
}
