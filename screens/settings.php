// /screens/settings.php
<!-- Settings Screen -->
    <div id="settings-screen" class="menu-screen hidden">
        <div class="menu-bg">
            <div class="menu-content">
                <h2 class="glitch" data-text="NASTAVENÍ">NASTAVENÍ</h2>
                <div class="settings-container">
                    <div class="setting-item">
                        <label for="sfx-toggle">Zvukové efekty</label>
                        <label class="toggle-switch">
                            <input type="checkbox" id="sfx-toggle" checked>
                            <span class="slider-round"></span>
                        </label>
                    </div>
                    <div class="setting-item">
                        <label>Animace</label>
                        <label class="toggle-switch">
                            <input type="checkbox" id="animations-toggle" checked>
                            <span class="slider-round"></span>
                        </label>
                    </div>
                    <div class="setting-item">
                        <label>Rychlost pohybu figurek</label>
                        <select id="ai-speed">
                            <option value="normal" selected>Normální</option>
                            <option value="fast">Rychlá</option>
                        </select>
                    </div>
                </div>
                <div class="settings-actions">
                    <button id="save-settings-btn" class="menu-btn">
                        <span>ULOŽIT</span>
                        <i class="fas fa-save"></i>
                    </button>
                    <button id="back-settings-btn" class="menu-btn">
                        <span>ZPĚT</span>
                        <i class="fas fa-arrow-left"></i>
                    </button>
                </div>
            </div>
        </div>
    </div>
