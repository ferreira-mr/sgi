<?php

declare(strict_types=1);

namespace Tests\Unit\Modules\Competicoes;

use App\Modules\Acesso\Domain\InterclasseRepository;
use App\Modules\Acesso\Presentation\Http\CompetitionAccess;
use App\Modules\Competicoes\Application\ChaveamentoService;
use App\Modules\Competicoes\Domain\ChaveamentoManagement;
use App\Modules\Competicoes\Presentation\Http\ChaveamentoController;
use App\Shared\Http\Request;
use App\Shared\Http\SessionManager;
use PHPUnit\Framework\TestCase;

final class ChaveamentoControllerTest extends TestCase
{
    /** @var array<string, mixed>|null */
    private ?array $previousSession = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->previousSession = isset($_SESSION) ? $_SESSION : null;
        SessionManager::start();
        $_SESSION = ['nivel' => 2, 'id_interclasse' => 10];
    }

    protected function tearDown(): void
    {
        $_SESSION = $this->previousSession ?? [];
        parent::tearDown();
    }

    public function testMesarioNaoPodePrepararProvaIndividualSemRanking(): void
    {
        $management = $this->createMock(ChaveamentoManagement::class);
        $modality = [
            'interclasses_id_interclasse' => 10,
            'tipos_modalidades_id_tipo_modalidade' => 37,
            'nome_tipo_modalidade' => 'Individual',
        ];
        $management->expects(self::exactly(2))->method('modality')->with(7)->willReturn($modality);
        $management->expects(self::never())->method('saveIndividual');

        $editions = $this->createMock(InterclasseRepository::class);
        $editions->method('findActiveId')->willReturn(10);

        $controller = new ChaveamentoController(
            new ChaveamentoService($management),
            new CompetitionAccess($editions),
        );
        $response = $controller(new Request(
            'POST',
            '/api/v1/chaveamentos',
            [],
            [],
            [],
            [],
            [],
            '{"id_modalidade":7,"tipo_modalidade":"individual"}',
        ));

        self::assertSame(403, $response->status());
        self::assertStringContainsString('não podem preparar', $response->body());
    }

    public function testPedidoLegadoDeGeracaoDeChaveamentoRetornaContratoEstavelSemPersistir(): void
    {
        $_SESSION = ['nivel' => 0, 'id_usuario' => 4];
        $management = $this->createMock(ChaveamentoManagement::class);
        $management->expects(self::exactly(2))->method('modality')->with(22)->willReturn([
            'interclasses_id_interclasse' => 10,
            'tipos_modalidades_id_tipo_modalidade' => 4,
            'nome_tipo_modalidade' => 'Mata-Mata',
        ]);
        $management->expects(self::never())->method('saveIndividual');

        $editions = $this->createMock(InterclasseRepository::class);
        $controller = new ChaveamentoController(
            new ChaveamentoService($management),
            new CompetitionAccess($editions),
        );
        $response = $controller(new Request(
            'POST',
            '/api/v1/chaveamentos',
            [],
            [],
            [],
            [],
            [],
            '{"id_modalidade":22,"tipo_modalidade":"mata_mata","acao":"gerar"}',
        ));

        self::assertSame(409, $response->status());
        self::assertStringContainsString('CHAVEAMENTO_DEVE_VIR_DO_CRONOGRAMA', $response->body());
    }
}
