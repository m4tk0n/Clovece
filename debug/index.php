<?php
declare(strict_types=1);
$version = date('Ymd-His');
?>
<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Člověče – Debug laboratoř</title>
  <link rel="stylesheet" href="debug.css?v=<?= htmlspecialchars($version, ENT_QUOTES, 'UTF-8') ?>">
  <script type="module" src="debug.js?v=<?= htmlspecialchars($version, ENT_QUOTES, 'UTF-8') ?>"></script>
</head>
<body>
  <main class="lab">
    <header class="lab-header">
      <div><p class="eyebrow">ODDĚLENÉ TESTOVACÍ PROSTŘEDÍ</p><h1>AI laboratoř</h1>
        <p class="muted">Změny zde neovlivňují běžnou hru. Laboratoř používá vlastní kopie herních a AI souborů.</p></div>
      <a href="../">Běžná hra ↗</a>
    </header>
    <section class="notice"><strong>Režim testování</strong><span>Výpočty používají samostatné kopie herního enginu, strategie a konfigurace uložené pouze v adresáři debug/js/. Hlavní hra tyto soubory nenačítá.</span></section>
    <section class="panel">
      <div class="section-heading"><div><h2>Deset strategických vah</h2><p class="muted">Uprav hodnoty a spusť nové vyhodnocení. Nic se neukládá na server.</p></div><button id="reset-weights" class="secondary" type="button">Výchozí hodnoty</button></div>
      <div id="weights" class="weights"><p>Načítám definice vah…</p></div>
    </section>
    <section class="panel">
      <div class="section-heading"><div><h2>Testovací situace</h2><p class="muted">Kontrolní pozice pro 40, 48 a 80 polí.</p></div></div>
      <div class="controls">
        <label>Velikost desky<select id="board-size"><option value="40">40 polí</option><option value="48">48 polí</option><option value="80">80 polí</option></select></label>
        <button id="run-test" type="button">Vyhodnotit všech 6 hodů</button>
      </div>
      <p id="status" class="status" role="status">Připraveno k testu.</p>
    </section>
    <section class="panel">
      <h2>Výsledek rozhodnutí</h2>
      <div id="decision" class="result"><p class="muted">Zatím nebyl spuštěn test.</p></div>
    </section>
    <section class="panel">
      <h2>Vyhodnocení všech šesti výsledků kostky</h2>
      <div id="dice-results" class="table-wrap"><p class="muted">Výsledky se zobrazí po vyhodnocení tahu.</p></div>
    </section>
    <footer>Debug laboratoř · samostatné soubory · změny se do hlavní hry přenášejí až po ověření a ručním sloučení.</footer>
  </main>
</body>
</html>
