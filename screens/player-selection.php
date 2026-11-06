<!-- Player Selection Screen -->
    <div id="player-selection" class="menu-screen hidden">
        <div class="menu-bg">
            <div class="menu-content">
                <h2 class="glitch" data-text="VYTVOŘENÍ HRY">VYTVOŘENÍ HRY</h2>
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
