// /styling/screens/room.php
<!-- Room Screen -->
    <div id="room-screen" class="menu-screen hidden">
        <div class="menu-bg">
            <div class="menu-content">
                <h2 class="glitch" data-text="MÍSTNOST">MÍSTNOST</h2>
                
                <div id="room-info" class="room-info">
                    <div class="room-code-display">
                        Pozvánka: <span id="room-code-display" class="highlight"></span>
                    </div>
                    <input id="room-invite-url" type="url" readonly aria-label="Pozvánkový odkaz">
                    <button id="copy-invite-btn" type="button" class="menu-btn">
                        <span>ZKOPÍROVAT POZVÁNKU</span>
                        <i class="fas fa-copy"></i>
                    </button>
                    <div class="room-status">
                        Status: <span id="room-status-display">Čeká</span>
                    </div>
                </div>
                
                <h3>Hráči</h3>
                <div id="participant-list" class="participant-list"></div>
                <form id="room-player-settings" class="room-actions hidden">
                    <label for="room-player-name">Tvoje zobrazované jméno</label>
                    <input id="room-player-name" type="text" maxlength="50" autocomplete="nickname" required>
                    <button type="submit" class="menu-btn">
                        <span>ZMĚNIT JMÉNO</span>
                        <i class="fas fa-user-pen"></i>
                    </button>
                    <label for="room-player-color">Tvoje barva figurek</label>
                    <select id="room-player-color" class="color-select"></select>
                    <button id="random-room-color-btn" type="button" class="menu-btn">
                        <span>NASTAVIT NÁHODNOU</span>
                        <i class="fas fa-shuffle"></i>
                    </button>
                </form>
                
                <div class="room-actions">
                    <button id="add-ai-player-btn" type="button" class="menu-btn secondary hidden">
                        <span>PŘIDAT POČÍTAČOVÉHO HRÁČE</span>
                        <i class="fas fa-robot"></i>
                    </button>
                    <button id="ready-btn" class="menu-btn">
                        <span id="ready-btn-text">JSem připraven</span>
                        <i class="fas fa-check"></i>
                    </button>
                    
                    <button id="room-start-game-btn" class="menu-btn pulse hidden">
                        <span>ZAČÍT HRU</span>
                        <i class="fas fa-play"></i>
                    </button>
                    
                    <button id="leave-room-btn" class="menu-btn">
                        <span>OPUSTIT MÍSTNOST</span>
                        <i class="fas fa-door-closed"></i>
                    </button>
                </div>
                
                <div class="room-chat">
                    <h4>Chat</h4>
                    <div id="room-chat-messages" class="chat-messages"></div>
                    <form id="room-chat-form" class="chat-form">
                        <input type="text" id="room-chat-input" placeholder="Napište zprávu..." maxlength="1000" autocomplete="off">
                        <button type="submit" class="menu-btn">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </form>
                </div>
                
                <button id="back-from-room" class="menu-btn">
                    <span>ZPĚT DO LOBBY</span>
                    <i class="fas fa-arrow-left"></i>
                </button>
            </div>
        </div>
    </div>
