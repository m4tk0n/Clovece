<!-- Lobby Screen -->
    <div id="lobby-screen" class="menu-screen hidden">
        <div class="menu-bg">
            <div class="menu-content">
                <h2 class="glitch" data-text="LOBBY">LOBBY</h2>
                
                <div class="lobby-actions">
                    <label for="online-player-name">Tvoje jméno</label>
                    <input id="online-player-name" type="text" maxlength="50" autocomplete="nickname" placeholder="Zobrazované jméno">
                    <label for="online-player-limit">Počet hráčů v místnosti</label>
                    <select id="online-player-limit" class="color-select">
                        <option value="2">2 hráči</option>
                        <option value="3">3 hráči</option>
                        <option value="4" selected>4 hráči</option>
                        <option value="5">5 hráčů</option>
                        <option value="6">6 hráčů</option>
                        <option value="7">7 hráčů</option>
                        <option value="8">8 hráčů</option>
                    </select>
                    <button id="create-room-btn-lobby" class="menu-btn pulse">
                        <span>VYTVOŘIT NOVOU MÍSTNOST</span>
                        <i class="fas fa-plus"></i>
                    </button>
                    
                    <div class="join-room-form">
                        <input type="text" id="room-code-input" placeholder="Vlož pozvánkový odkaz" maxlength="300">
                        <button id="join-room-btn-lobby" class="menu-btn">
                            <span>PŘIPOJIT SE</span>
                            <i class="fas fa-door-open"></i>
                        </button>
                    </div>
                </div>
                
                <section class="identity-transfer">
                    <h3>Přenos identity na jiné zařízení</h3>
                    <p>Na původním zařízení vytvoř kód. Na novém zařízení ho zadej zde. Platí 15 minut a lze ho použít pouze jednou.</p>
                    <button id="create-transfer-code-btn" type="button" class="menu-btn secondary">
                        <span>VYTVOŘIT PŘENOSOVÝ KÓD</span>
                        <i class="fas fa-key"></i>
                    </button>
                    <input id="transfer-code-output" type="text" readonly autocomplete="off" placeholder="Zde se zobrazí přenosový kód">
                    <label for="transfer-code-input">Kód z druhého zařízení</label>
                    <input id="transfer-code-input" type="text" maxlength="60" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Vlož přenosový kód">
                    <button id="claim-transfer-code-btn" type="button" class="menu-btn">
                        <span>PŘEVÉST IDENTITU NA TOTO ZAŘÍZENÍ</span>
                        <i class="fas fa-right-left"></i>
                    </button>
                </section>

                <h3>Seznam místností</h3>
                <div id="room-list" class="room-list"></div>
                
                <button id="back-from-lobby" class="menu-btn secondary fit-content">
                    <span>ZPĚT</span>
                    <i class="fas fa-arrow-left"></i>
                </button>
            </div>
        </div>
    </div>
