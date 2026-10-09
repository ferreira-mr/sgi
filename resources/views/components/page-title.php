<?php
$tituloPagina = trim((string) ($tituloPagina ?? $titulo ?? ''));

if ($tituloPagina === '') {
    $caminhoRequisicao = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH);
    $basePath = trim((string) \App\Shared\Http\Url::basePath(), '/');
    $caminhoRequisicao = trim($caminhoRequisicao, '/');

    if ($basePath !== '' && ($caminhoRequisicao === $basePath || str_starts_with($caminhoRequisicao, $basePath . '/'))) {
        $caminhoRequisicao = ltrim(substr($caminhoRequisicao, strlen($basePath)), '/');
    }

    $titulosPorRota = [
        'aluno/inicio' => 'Início',
        'aluno/login' => 'Entrar',
        'login' => 'Entrar',
        'aluno/ranking' => 'Ranking de turmas',
        'aluno/trocar-senha' => 'Alterar senha',
        'categorias' => 'Categorias',
        'chaveamento' => 'Chaveamentos',
        'equipes/alunos' => 'Estudantes da equipe',
        'equipes/elenco' => 'Elenco da equipe',
        'edicoes' => 'Edições',
        'jogos/placar' => 'Placar',
        'modalidades/detalhes' => 'Modalidade',
        'ocorrencias' => 'Ocorrências',
        'turmas/alunos' => 'Estudantes da turma',
        'turmas' => 'Turmas',
    ];
    $tituloPagina = $titulosPorRota[$caminhoRequisicao] ?? 'SGI';
}

$tituloPagina = htmlspecialchars($tituloPagina, ENT_QUOTES, 'UTF-8');
$tituloDocumento = $tituloPagina === 'SGI' ? 'SGI' : $tituloPagina . ' | SGI';
?>
<meta name="sgi-page-title" content="<?= $tituloPagina ?>">
<title><?= $tituloDocumento ?></title>
