<?php

declare(strict_types=1);

use App\Modules\Competicoes\Domain\PontoRepository;

/** Test decorator that pauses an annulment after PontoService validated the pre-read state. */
final class AnnulmentBarrierPontoRepository implements PontoRepository
{
    private ?string $observedGameStatus = null;

    public function __construct(
        private readonly PontoRepository $inner,
        private readonly string $barrier,
    ) {
    }

    public function edicaoDoJogo(int $gameId): ?int
    {
        return $this->inner->edicaoDoJogo($gameId);
    }

    public function edicaoDaEquipe(int $teamId): ?int
    {
        return $this->inner->edicaoDaEquipe($teamId);
    }

    public function edicaoDoPonto(int $pointId): ?int
    {
        return $this->inner->edicaoDoPonto($pointId);
    }

    public function listarAtletas(int $gameId, int $teamId): array
    {
        return $this->inner->listarAtletas($gameId, $teamId);
    }

    public function listarPontos(int $gameId, ?int $teamId = null): array
    {
        return $this->inner->listarPontos($gameId, $teamId);
    }

    public function contextoPartida(int $gameId, int $partidaId, int $teamId): ?array
    {
        return $this->inner->contextoPartida($gameId, $partidaId, $teamId);
    }

    public function atletaElegivel(int $userId, int $gameId, int $teamId): bool
    {
        return $this->inner->atletaElegivel($userId, $gameId, $teamId);
    }

    public function buscarPorChave(string $key): ?array
    {
        return $this->inner->buscarPorChave($key);
    }

    public function inserir(array $data): array
    {
        return $this->inner->inserir($data);
    }

    public function buscar(int $pointId): ?array
    {
        $point = $this->inner->buscar($pointId);
        $this->observedGameStatus = $point === null ? null : (string) ($point['status_jogo'] ?? '');
        return $point;
    }

    public function anular(int $pointId, int $operatorId, ?string $expectedGameStatus = null): array
    {
        $ready = $this->barrier . DIRECTORY_SEPARATOR . 'validated';
        $payload = [
            'point_id' => $pointId,
            'status_jogo' => $this->observedGameStatus,
            'pid' => getmypid(),
        ];
        $tmp = $ready . '.tmp.' . getmypid() . '.' . bin2hex(random_bytes(4));
        if (@file_put_contents($tmp, json_encode($payload, JSON_THROW_ON_ERROR), LOCK_EX) === false || !@rename($tmp, $ready)) {
            @unlink($tmp);
            throw new RuntimeException('Não foi possível anunciar a validação da anulação.');
        }

        $release = $this->barrier . DIRECTORY_SEPARATOR . 'continue';
        $deadline = microtime(true) + 10.0;
        while (!is_file($release) && microtime(true) < $deadline) {
            usleep(10000);
        }
        if (!is_file($release)) {
            throw new RuntimeException('A barreira de anulação não foi liberada.');
        }
        return $this->inner->anular($pointId, $operatorId, $expectedGameStatus);
    }

    public function exigeVinculo(int $gameId): bool
    {
        return $this->inner->exigeVinculo($gameId);
    }

    public function garantirPartidas(int $gameId, array $results): void
    {
        $this->inner->garantirPartidas($gameId, $results);
    }

    public function validarPlacarVinculado(int $gameId, array $results): void
    {
        $this->inner->validarPlacarVinculado($gameId, $results);
    }

    public function persistirPontosOffline(int $gameId, array $points, int $operatorId, ?string $expectedGameStatus = null): void
    {
        $this->inner->persistirPontosOffline($gameId, $points, $operatorId, $expectedGameStatus);
    }
}
