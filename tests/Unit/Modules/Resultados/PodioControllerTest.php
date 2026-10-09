<?php

declare(strict_types=1);

namespace Tests\Unit\Modules\Resultados;

use App\Modules\Resultados\Application\PontuacaoService;
use App\Modules\Resultados\Domain\PodioRepository;
use App\Modules\Resultados\Presentation\Http\PodioController;
use App\Shared\Http\Request;
use PHPUnit\Framework\TestCase;

final class PodioControllerTest extends TestCase
{
    protected function setUp(): void
    {
        $_SESSION = [];
    }

    protected function tearDown(): void
    {
        $_SESSION = [];
    }

    public function testOptionsReturnsNoContent(): void
    {
        $repo = new PodioRepositoryStub();
        $controller = new PodioController(new PontuacaoService($repo));
        $request = new Request('OPTIONS', '/api/v1/podios');

        $response = $controller($request);

        self::assertSame(204, $response->status());
    }

    public function testConsultarRejectsUnauthenticated(): void
    {
        $repo = new PodioRepositoryStub();
        $controller = new PodioController(new PontuacaoService($repo));
        $request = new Request('GET', '/api/v1/podios', ['id_interclasse' => '1', 'id_modalidade' => '2']);

        $response = $controller($request);

        self::assertSame(401, $response->status());
    }

    public function testConsultarReturnsPodioForAuthenticatedUser(): void
    {
        $_SESSION = ['id' => 10, 'nivel' => 3];
        $repo = new PodioRepositoryStub();
        $repo->podioRetorno = [
            ['posicao' => 1, 'id_equipe' => 101, 'nome_equipe' => 'Equipe Alpha'],
        ];
        $controller = new PodioController(new PontuacaoService($repo));
        $request = new Request('GET', '/api/v1/podios', ['id_interclasse' => '1', 'id_modalidade' => '2']);

        $response = $controller($request);

        self::assertSame(200, $response->status());
        $body = json_decode($response->body(), true);
        self::assertTrue($body['success']);
        self::assertCount(1, $body['podio']);
        self::assertSame('Equipe Alpha', $body['podio'][0]['nome_equipe']);
    }

    public function testConsultarRejectsMissingParameters(): void
    {
        $_SESSION = ['id' => 10, 'nivel' => 3];
        $repo = new PodioRepositoryStub();
        $controller = new PodioController(new PontuacaoService($repo));
        $request = new Request('GET', '/api/v1/podios', ['id_interclasse' => '0']);

        $response = $controller($request);

        self::assertSame(400, $response->status());
    }

    public function testSalvarRejectsNonAdmin(): void
    {
        $_SESSION = ['id' => 10, 'nivel' => 1]; // Colaborador não pode salvar pódio
        $repo = new PodioRepositoryStub();
        $controller = new PodioController(new PontuacaoService($repo));
        $payload = ['id_interclasse' => 1, 'id_modalidade' => 2, 'podio' => [['posicao' => 1, 'id_equipe' => 101]]];
        $request = new Request('POST', '/api/v1/podios', [], [], [], ['content-type' => 'application/json'], [], json_encode($payload));

        $response = $controller($request);

        self::assertSame(403, $response->status());
    }

    public function testSalvarAppliesPodioSuccessfullyForAdmin(): void
    {
        $_SESSION = ['id' => 1, 'nivel' => 0];
        $repo = new PodioRepositoryStub();
        $controller = new PodioController(new PontuacaoService($repo));
        $payload = [
            'id_interclasse' => 1,
            'id_modalidade' => 2,
            'podio' => [
                ['posicao' => 1, 'id_equipe' => 101],
                ['posicao' => 2, 'id_equipe' => 102],
            ],
        ];
        $request = new Request('POST', '/api/v1/podios', [], [], [], ['content-type' => 'application/json'], [], json_encode($payload));

        $response = $controller($request);

        self::assertSame(200, $response->status());
        $body = json_decode($response->body(), true);
        self::assertTrue($body['success']);
        self::assertCount(2, $repo->replaced);
    }
}

final class PodioRepositoryStub implements PodioRepository
{
    /** @var list<array<string,mixed>> */
    public array $replaced = [];
    /** @var list<array<string,mixed>> */
    public array $podioRetorno = [];

    public function carregarContextoJogo(int $gameId): ?array
    {
        return null;
    }

    public function carregarPartidasJogo(int $gameId): array
    {
        return [];
    }

    public function carregarTerceiroLugarDaFinal(int $gameId): ?int
    {
        return null;
    }

    public function carregarBloqueados(int $interclasseId, int $modalidadeId): array
    {
        return [];
    }

    public function substituirPosicoes(int $interclasseId, int $modalidadeId, array $posicoes): void
    {
        $this->replaced = $posicoes;
    }

    public function aplicarDeltas(array $deltas): void
    {
    }

    public function turmaDaEquipe(int $equipeId, int $modalidadeId): ?int
    {
        return match ($equipeId) {
            101 => 1,
            102 => 2,
            default => null,
        };
    }

    public function diagnosticar(): array
    {
        return [];
    }

    public function invalidarFontesSemOrigemAtual(int $interclasseId, int $modalidadeId): void
    {
    }

    public function pontosPadraoEdicao(int $interclasseId): array
    {
        return [1 => 10, 2 => 7, 3 => 5];
    }

    public function carregarPodioModalidade(int $interclasseId, int $modalidadeId): array
    {
        return $this->podioRetorno;
    }
}
