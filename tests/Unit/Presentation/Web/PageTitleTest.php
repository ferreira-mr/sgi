<?php

declare(strict_types=1);

namespace Tests\Unit\Presentation\Web;

use PHPUnit\Framework\TestCase;

final class PageTitleTest extends TestCase
{
    public function testTitleComponentRendersPageSpecificTitleSafely(): void
    {
        $requestUriAnterior = $_SERVER['REQUEST_URI'] ?? null;
        $_SERVER['REQUEST_URI'] = '/SGI/dashboard';
        $titulo = 'Agenda "A" & <B>';

        ob_start();
        try {
            include $this->path('resources/views/components/page-title.php');
            $render = str_replace("\r\n", "\n", trim((string) ob_get_contents()));
        } finally {
            ob_end_clean();
            if ($requestUriAnterior === null) {
                unset($_SERVER['REQUEST_URI']);
            } else {
                $_SERVER['REQUEST_URI'] = $requestUriAnterior;
            }
        }

        self::assertSame(
            '<meta name="sgi-page-title" content="Agenda &quot;A&quot; &amp; &lt;B&gt;">' . "\n" .
            '<title>Agenda &quot;A&quot; &amp; &lt;B&gt; | SGI</title>',
            $render,
        );
    }

    public function testAllHtmlHeadsIncludeTheCanonicalTitleComponent(): void
    {
        foreach ([
            'resources/views/components/admin-head.php',
            'resources/views/components/aluno-head.php',
            'resources/views/pages/acesso/login.php',
        ] as $file) {
            $source = file_get_contents($this->path($file));

            self::assertIsString($source, $file);
            self::assertStringContainsString('components/page-title.php', $source, $file);
        }
    }

    public function testPageTemplatesDoNotDeclareTheirOwnTitles(): void
    {
        $files = glob($this->path('resources/views/pages/**/*.php')) ?: [];
        $files[] = $this->path('resources/views/pages/acesso/login.php');

        foreach (array_unique($files) as $file) {
            $source = file_get_contents($file);

            self::assertIsString($source, $file);
            self::assertStringNotContainsString('<title', $source, $file);
            self::assertStringNotContainsString('$tituloPagina', $source, $file);
        }
    }

    public function testClientNavigationKeepsTheCanonicalTitle(): void
    {
        $adminHead = file_get_contents($this->path('resources/views/components/admin-head.php'));
        $interclasseService = file_get_contents($this->path('resources/js/shared/interclasse-service.js'));
        $turmaAlunos = file_get_contents($this->path('resources/js/pages/participantes/turma-alunos.js'));
        $offline = file_get_contents($this->path('resources/js/offline/mesario-offline.js'));

        self::assertIsString($adminHead);
        self::assertIsString($interclasseService);
        self::assertIsString($turmaAlunos);
        self::assertIsString($offline);
        self::assertStringContainsString('js/shared/interclasse-service.js', $adminHead);
        self::assertStringContainsString('const tituloPagina = String(metaTituloPagina', $interclasseService);
        self::assertStringContainsString("tituloPagina + ' | SGI'", $interclasseService);
        self::assertStringNotContainsString('SGI - Alunos da Turma', $turmaAlunos);
        self::assertStringNotContainsString('SGI - Estudantes da turma', $turmaAlunos);
        self::assertStringNotContainsString('document.title = TELA_TITULO', $offline);
        self::assertStringContainsString('document.title = tituloDocumento(rec.titulo, TELA_TITULO[tela]);', $offline);
    }

    private function path(string $relative): string
    {
        return dirname(__DIR__, 4) . '/' . $relative;
    }
}
