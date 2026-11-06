<!-- Account Profile Screen -->
<div id="profile-screen" class="menu-screen hidden">
    <div class="menu-bg">
        <div class="menu-content profile-content">
            <h2 class="glitch" data-text="MŮJ PROFIL">MŮJ PROFIL</h2>

            <form id="profile-form" class="auth-form profile-form">
                <div class="form-group">
                    <label for="profile-display-name">Zobrazované jméno</label>
                    <input id="profile-display-name" name="display_name" type="text" maxlength="50" required autocomplete="nickname">
                </div>
                <div class="form-group">
                    <label for="profile-color">Moje barva hráče</label>
                    <select id="profile-color" name="color" class="color-select">
                        <option value="#E53935">Červená</option>
                        <option value="#1E88E5">Modrá</option>
                        <option value="#43A047">Zelená</option>
                        <option value="#F9A825">Žlutá</option>
                        <option value="#FB8C00">Oranžová</option>
                        <option value="#8E24AA">Fialová</option>
                        <option value="#00ACC1">Tyrkysová</option>
                        <option value="#D81B60">Růžová</option>
                    </select>
                    <span id="profile-color-preview" class="profile-color-preview" aria-hidden="true"></span>
                </div>
                <p id="profile-message" class="auth-message" role="status" aria-live="polite"></p>
                <button type="submit" class="menu-btn">
                    <span>ULOŽIT PROFIL</span>
                    <i class="fas fa-save"></i>
                </button>
            </form>

            <section id="profile-statistics" class="profile-statistics" aria-labelledby="profile-statistics-title">
                <h3 id="profile-statistics-title">MOJE STATISTIKY</h3>
                <div class="profile-stats-grid">
                    <div class="profile-stat"><strong id="profile-stat-games">—</strong><span>Odehrané hry</span></div>
                    <div class="profile-stat"><strong id="profile-stat-wins">—</strong><span>Výhry</span></div>
                    <div class="profile-stat"><strong id="profile-stat-losses">—</strong><span>Prohry</span></div>
                    <div class="profile-stat"><strong id="profile-stat-rate">—</strong><span>Úspěšnost</span></div>
                </div>
                <p class="profile-stats-note">Statistiky se počítají z dokončených online her.</p>
            </section>

            <button id="back-profile-btn" class="menu-btn">
                <span>ZPĚT</span>
                <i class="fas fa-arrow-left"></i>
            </button>
        </div>
    </div>
</div>
