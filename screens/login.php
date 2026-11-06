<!-- Login Screen -->
    <div id="login-screen" class="menu-screen hidden">
        <div class="menu-bg">
            <div class="menu-content">
                <h2 class="glitch" data-text="PŘIHLÁŠENÍ">PŘIHLÁŠENÍ</h2>
                <form id="login-form" class="auth-form">
                    <div class="form-group">
                        <label for="login-username">Uživatelské jméno</label>
                        <input type="text" id="login-username" name="username" required autocomplete="username">
                        <i class="fas fa-user"></i>
                    </div>
                    <div class="form-group">
                        <label for="login-password">Heslo</label>
                        <input type="password" id="login-password" name="password" required autocomplete="current-password">
                        <i class="fas fa-lock"></i>
                    </div>
                    <button type="submit" class="menu-btn">
                        <span>PŘIHLÁSIT SE</span>
                        <i class="fas fa-sign-in-alt"></i>
                    </button>
                </form>
                <p class="auth-link">
                    Nemáte účet? <button type="button" id="show-register" class="link-btn">Registrujte se</button>
                </p>
                <button id="back-from-login" class="menu-btn secondary fit-content">
                    <span>ZPĚT</span>
                    <i class="fas fa-arrow-left"></i>
                </button>
            </div>
        </div>
    </div>
