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
                <button id="extended-rules-toggle" class="menu-btn extended-rules-toggle" type="button" aria-expanded="false" aria-controls="extended-rules-panel">
                    <span>ROZŠÍŘENÁ PRAVIDLA</span>
                    <i class="fas fa-chevron-down" aria-hidden="true"></i>
                </button>
                <section id="extended-rules-panel" class="extended-rules-panel hidden" aria-label="Volitelná pravidla hry">
                    <div class="extended-rule-row">
                        <div class="extended-rule-description">
                            <span>Pravidlo 1</span>
                            <button class="rule-info" type="button" aria-label="Informace k pravidlu 1" title="Ukázkové pravidlo. Popis bude doplněn.">i</button>
                        </div>
                        <button class="rule-switch" type="button" data-rule-toggle="rule1" aria-pressed="false"><span>NE</span></button>
                    </div>
                    <div class="extended-rule-row">
                        <div class="extended-rule-description">
                            <span>Pravidlo 2</span>
                            <button class="rule-info" type="button" aria-label="Informace k pravidlu 2" title="Ukázkové pravidlo. Popis bude doplněn.">i</button>
                        </div>
                        <button class="rule-switch" type="button" data-rule-toggle="rule2" aria-pressed="false"><span>NE</span></button>
                    </div>
                    <div class="extended-rule-row">
                        <div class="extended-rule-description">
                            <span>Pravidlo 3</span>
                            <button class="rule-info" type="button" aria-label="Informace k pravidlu 3" title="Ukázkové pravidlo. Popis bude doplněn.">i</button>
                        </div>
                        <button class="rule-switch" type="button" data-rule-toggle="rule3" aria-pressed="false"><span>NE</span></button>
                    </div>
                </section>
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
