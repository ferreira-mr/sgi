<?php

declare(strict_types=1);

namespace Tests\Unit\Simulation;

use PHPUnit\Framework\TestCase;
use Tests\Support\Simulation\TournamentManifest;
use Tests\Support\Simulation\TournamentOracle;
use InvalidArgumentException;

final class TournamentManifestTest extends TestCase
{
    public function testDefaultManifestCoversEveryStandardClassAndAllEnrollments(): void
    {
        $manifest = TournamentManifest::load();

        self::assertSame(7, count($manifest->classes()));
        self::assertSame(5, count($manifest->modalities()));
        self::assertSame([
            'classes' => 7,
            'students_per_class' => 32,
            'students' => 224,
            'modalities' => 10,
            'teams' => 35,
            'enrollments' => 322,
            'students_by_modality_count' => [1 => 140, 2 => 70, 3 => 14],
        ], $manifest->summary());
        self::assertSame([1 => 224, 2 => 308, 3 => 322], $manifest->cumulativeEnrollmentWaveCounts());
        self::assertSame([
            '6EF' => 144,
            '7EF' => 88,
            '8EF' => 112,
            '9EF' => 156,
            '1EMA' => 100,
            '2EMA' => 124,
            '3EMA' => 68,
        ], $manifest->expectedNetPointsByClass());
        self::assertSame([
            'sports_points_by_class' => ['6EF' => 100, '7EF' => 40, '8EF' => 60, '9EF' => 100, '1EMA' => 40, '2EMA' => 60, '3EMA' => 0],
            'fundraising_points_by_class' => ['6EF' => 49, '7EF' => 53, '8EF' => 57, '9EF' => 61, '1EMA' => 65, '2EMA' => 69, '3EMA' => 73],
            'penalty_points_per_class' => 5,
            'net_points_by_class' => ['6EF' => 144, '7EF' => 88, '8EF' => 112, '9EF' => 156, '1EMA' => 100, '2EMA' => 124, '3EMA' => 68],
            'ranking_order' => ['9EF', '6EF', '2EMA', '8EF', '1EMA', '7EF', '3EMA'],
            'sports_points' => 400,
            'fundraising_points' => 427,
            'gross_points' => 827,
            'penalty_points' => 35,
            'net_points' => 792,
        ], TournamentOracle::compute($manifest));
    }

    public function testRejectsDuplicateClassAliases(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'sgi-simulation-manifest-');
        self::assertNotFalse($path);
        try {
            $data = json_decode((string) file_get_contents(dirname(__DIR__, 2) . '/fixtures/simulacao-interclasse/manifest.json'), true, 64, JSON_THROW_ON_ERROR);
            $data['classes'][0]['alias'] = $data['classes'][1]['alias'];
            file_put_contents($path, json_encode($data, JSON_THROW_ON_ERROR));
            $this->expectException(InvalidArgumentException::class);
            TournamentManifest::load($path);
        } finally {
            @unlink($path);
        }
    }

    public function testRejectsOutOfRangeStudentId(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'sgi-simulation-manifest-');
        self::assertNotFalse($path);
        try {
            $data = json_decode((string) file_get_contents(dirname(__DIR__, 2) . '/fixtures/simulacao-interclasse/manifest.json'), true, 64, JSON_THROW_ON_ERROR);
            $data['modalities'][0]['student_ids'][0] = 33;
            file_put_contents($path, json_encode($data, JSON_THROW_ON_ERROR));
            $this->expectException(InvalidArgumentException::class);
            TournamentManifest::load($path);
        } finally {
            @unlink($path);
        }
    }

    public function testRejectsInvalidExpectedRosterSize(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'sgi-simulation-manifest-');
        self::assertNotFalse($path);
        try {
            $data = json_decode((string) file_get_contents(dirname(__DIR__, 2) . '/fixtures/simulacao-interclasse/manifest.json'), true, 64, JSON_THROW_ON_ERROR);
            $data['students_per_class'] = 31;
            file_put_contents($path, json_encode($data, JSON_THROW_ON_ERROR));
            $this->expectException(InvalidArgumentException::class);
            TournamentManifest::load($path);
        } finally {
            @unlink($path);
        }
    }
}
