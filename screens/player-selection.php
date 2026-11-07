<!-- Player Selection Screen -->
    <div id="player-selection" class="menu-screen hidden">
        <div class="menu-bg">
            <div class="menu-content">
                <h2 class="glitch" data-text="VYTVOŘENÍ MÍSTNÍ HRY">VYTVOŘENÍ MÍSTNÍ HRY</h2>
                <div class="selection-container">
                    <div class="setup-grid" id="setup-grid">
                        <div class="setup-control">
                            <span class="setup-label">ŽIVÍ HRÁČI</span>
                            <div class="setup-stepper" role="group" aria-label="Počet živých hráčů">
                                <button type="button" class="setup-stepper-btn" data-count-target="human-players" data-count-step="-1" aria-label="Odebrat živého hráče">−</button>
                                <strong id="human-players-value" aria-live="polite">1</strong>
                                <button type="button" class="setup-stepper-btn" data-count-target="human-players" data-count-step="1" aria-label="Přidat živého hráče">+</button>
                            </div>
                            <input type="hidden" id="human-players" min="1" max="8" value="1">
                        </div>
                        <div class="setup-control">
                            <span class="setup-label">AI SOUPEŘI</span>
                            <div class="setup-stepper" role="group" aria-label="Počet počítačových soupeřů">
                                <button type="button" class="setup-stepper-btn" data-count-target="ai-players" data-count-step="-1" aria-label="Odebrat AI soupeře">−</button>
                                <strong id="ai-players-value" aria-live="polite">1</strong>
                                <button type="button" class="setup-stepper-btn" data-count-target="ai-players" data-count-step="1" aria-label="Přidat AI soupeře">+</button>
                            </div>
                            <input type="hidden" id="ai-players" min="0" max="7" value="1">
                        </div>
                    </div>
                    <div class="board-size-control ai-difficulty-control">
                        <label class="board-size-label" for="ai-difficulty">OBTÍŽNOST AI</label>
                        <select id="ai-difficulty" class="ai-difficulty-select" aria-label="Obtížnost počítačových soupeřů">
                            <option value="easy">Lehká</option>
                            <option value="medium" selected>Střední</option>
                            <option value="hard">Těžká</option>
                        </select>
                    </div>
                    <div class="board-size-control">
                        <span class="board-size-label">VELIKOST DESKY</span>
                        <div class="board-size-options" id="board-size-options" role="group" aria-label="Velikost hrací desky">
                            <button type="button" class="board-size-btn is-active" data-board-size="40" aria-pressed="true">40</button>
                            <button type="button" class="board-size-btn" data-board-size="48" aria-pressed="false">48</button>
                            <button type="button" class="board-size-btn" data-board-size="80" aria-pressed="false">80</button>
                        </div>
                    </div>
                    <div class="player-preview" id="player-preview">
                        <h3>SESTAVA U STOLU</h3>
                        <div class="preview-players" id="preview-players"></div>
                        <button id="random-player-colors-btn" type="button" class="menu-btn">
                            <span>NÁHODNĚ ROZDĚLIT BARVY</span>
                            <i class="fas fa-shuffle"></i>
                        </button>
                    </div>
                </div>
                <div class="extended-rules-control">
                <button id="extended-rules-toggle" class="menu-btn extended-rules-toggle" type="button" aria-expanded="false" aria-controls="extended-rules-panel">
                    <span>ROZŠÍŘENÁ PRAVIDLA</span>
                    <i class="fas fa-chevron-down" aria-hidden="true"></i>
                </button>
                <section id="extended-rules-panel" class="extended-rules-panel hidden" aria-label="Volitelná pravidla hry">
                    <div class="extended-rule-row">
                        <div class="extended-rule-description">
                            <span>3 HODY</span>
                            <button class="rule-info" type="button" data-rule-info aria-label="Nápověda: 3 hody" aria-expanded="false">i</button>
                            <p class="rule-hint" hidden>Pokud má hráč všechny čtyři figurky v základně, může házet až třikrát. Jakmile hodí šestku, může nasadit figurku. Pokud šestka nepadne ani na třetí pokus, tah končí.</p>
                        </div>
                        <button class="rule-switch" type="button" data-rule-toggle="threeRolls" aria-pressed="true"><span>ANO</span></button>
                    </div>
                    <div class="extended-rule-row">
                        <div class="extended-rule-description">
                            <span>POVINNOST NASADIT</span>
                            <button class="rule-info" type="button" data-rule-info aria-label="Nápověda: Povinnost nasadit" aria-expanded="false">i</button>
                            <p class="rule-hint" hidden>Pokud má hráč alespoň jednu figurku v základně a hodí šestku, musí nasadit figurku ze základny. Pokud je pravidlo vypnuté, může místo nasazení táhnout již nasazenou figurkou.</p>
                        </div>
                        <button class="rule-switch" type="button" data-rule-toggle="mustDeploy" aria-pressed="true"><span>ANO</span></button>
                    </div>                    <div class="extended-rule-row">
                        <div class="extended-rule-description">
                            <span>PŘESKAKOVÁNÍ V DOMEČKU</span>
                            <button class="rule-info" type="button" data-rule-info aria-label="Nápověda: Přeskakování v domečku" aria-expanded="false">i</button>
                            <p class="rule-hint" hidden>Vlastní figurky v domečku můžeš při pohybu přeskočit. Hod kostkou určuje přesnou cílovou pozici (například z D1 při hodu 2 na D3). Cílové políčko musí být volné; na obsazeném skončit nelze.</p>
                        </div>
                        <button class="rule-switch" type="button" data-rule-toggle="skipHomePieces" aria-pressed="true"><span>ANO</span></button>
                    </div>
                    <div class="extended-rule-row">
                        <div class="extended-rule-description">
                            <span>POVINNĚ DO DOMEČKU</span>
                            <button class="rule-info" type="button" data-rule-info aria-label="Nápověda: Povinně do domečku" aria-expanded="false">i</button>
                            <p class="rule-hint" hidden>Pokud můžeš podle hodu kostkou legálně vstoupit některou figurkou do volného cílového pole, musíš tento tah využít. Pokud žádný takový tah není možný, můžeš táhnout jinou figurkou.</p>
                        </div>
                        <button class="rule-switch" type="button" data-rule-toggle="mustEnterHome" aria-pressed="true"><span>ANO</span></button>
                    </div>
                    <div class="extended-rule-row">
                        <div class="extended-rule-description">
                            <span>TŘI ŠESTKY ZA SEBOU</span>
                            <button class="rule-info" type="button" data-rule-info aria-label="Nápověda: Tři šestky za sebou" aria-expanded="false">i</button>
                            <p class="rule-hint" hidden>Pokud během jednoho tahu hodíš třikrát po sobě šestku, třetí šestku ještě normálně zahraješ. Potom se tvoje figurka na hlavní trase nejblíže domečku vrátí do základny a tah končí. Figurky v domečku se trestu netýkají.</p>
                        </div>
                        <button class="rule-switch" type="button" data-rule-toggle="threeSixesPenalty" aria-pressed="false"><span>NE</span></button>
                    </div>
                </section>
                </div>
                <button id="start-game-btn" class="menu-btn">
                    <span>ZAČÍT HRU</span>
                    <i class="fas fa-dice"></i>
                </button>
                <button id="back-to-menu-btn" class="menu-btn">
                    <span>ZPĚT</span>
                    <i class="fas fa-arrow-left"></i>
                </button>
            </div>
        </div>
    </div>
