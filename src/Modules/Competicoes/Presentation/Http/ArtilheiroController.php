<?php

declare(strict_types=1);

namespace App\Modules\Competicoes\Presentation\Http;

use App\Modules\Acesso\Presentation\Http\CompetitionAccess;
use App\Modules\Competicoes\Infrastructure\MysqliArtilheiroQueries;
use App\Shared\Http\AccessGuard;
use App\Shared\Http\Request;
use App\Shared\Http\Response;

final class ArtilheiroController
{
    public function __construct(
        private readonly MysqliArtilheiroQueries $queries,
        private readonly CompetitionAccess $access,
    ) {
    }

    public function __invoke(Request $request): Response
    {
        if (($denied = AccessGuard::authorize([0, 1, 2, 3])) !== null) {
            return $denied;
        }
        if ($request->method() === 'GET') {
            if ((int) ($_SESSION['nivel'] ?? -1) === 3) {
                return Response::json([
                    'success' => false,
                    'message' => 'A artilharia será liberada após a premiação.',
                ], 403);
            }
            $filters = $request->allQuery();
            if ((int) ($_SESSION['nivel'] ?? -1) === 2) {
                if ((int) ($_SESSION['id_interclasse'] ?? 0) <= 0) {
                    return Response::json(['success' => false, 'message' => 'Nenhuma edição ativa.'], 403);
                }
                $filters['id_interclasse'] = (int) ($_SESSION['id_interclasse'] ?? 0);
            }
            return Response::json($this->queries->list($filters));
        }
        $data = $request->allInput();
        $resourceEdition = null;
        if ((int) ($_SESSION['nivel'] ?? -1) === 2) {
            $gameId = (int) ($data['jogos_id_jogo'] ?? $data['id_jogo'] ?? 0);
            if ($gameId > 0) {
                $resourceEdition = $this->queries->editionOfGame($gameId);
            }
        }
        if (($denied = $this->access->authorize($resourceEdition)) !== null) {
            return $denied;
        }
        return Response::json([
            'success' => false,
            'message' => 'O lançamento de gol foi substituído por um ponto vinculado a uma partida e a um estudante.',
        ], 422);
    }
}
