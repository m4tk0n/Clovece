<!-- Register Screen -->
    <div id="register-screen" class="menu-screen hidden">
        <div class="menu-bg">
            <div class="menu-content">
                <h2 class="glitch" data-text="REGISTRACE">REGISTRACE</h2>
                <form id="register-form" class="auth-form">
                    <div class="form-group">
                        <label for="register-username">Uživatelské jméno (3-50 znaků)</label>
                        <input type="text" id="register-username" name="username" required minlength="3" maxlength="50" autocomplete="username">
                        <i class="fas fa-user"></i>
                    </div>
                    <div class="form-group">
                        <label for="register-password">Heslo (min. 6 znaků)</label>
                        <input type="password" id="register-password" name="password" required minlength="6" autocomplete="new-password">
                        <i class="fas fa-lock"></i>
                    </div>
                    <div class="form-group">
                        <label for="register-display-name">Zobrazované jméno (volitelné)</label>
                        <input type="text" id="register-display-name" name="display_name" autocomplete="name">
                        <i class="fas fa-tag"></i>
                    </div>
                    <div class="form-group">
                        <label for="register-color">Barva</label>
                        <select id="register-color" name="color" class="color-select">
                            <option value="#ff6b6b">Červená</option>
                            <option value="#4ecdc4">Tyrkysová</option>
                            <option value="#ffe66d">Žlutá</option>
                            <option value="#a8e6cf">Zelená</option>
                            <option value="#ff8b94">Růžová</option>
                            <option value="#b4a7d6">Fialová</option>
                            <option value="#d4a373">Oranžová</option>
                            <option value="#9999ff">Modrá</option>
                        </select>
                    </div>
                    <button type="submit" class="menu-btn">
                        <span>REGISTROVAT</span>
                        <i class="fas fa-user-plus"></i>
                    </button>
                </form>
                <p id="register-message" class="auth-message" role="status" aria-live="polite"></p>
                <p class="auth-link">
                    Již máte účet? <button type="button" id="show-login" class="link-btn">Přihlašte se</button>
                </p>
                <button id="back-from-register" class="menu-btn">
                    <span>ZPĚT</span>
                    <i class="fas fa-arrow-left"></i>
                </button>
            </div>
        </div>
    </div>
