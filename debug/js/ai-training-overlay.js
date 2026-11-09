import { getAIWeight, setAIWeightOverrides } from '../../js/ai-weight-config.js';
import { saveAIWeightFeedback } from './ai-training-knowledge.js';
import { buildAIWeightReviewQuestions } from '../../js/ai-weight-metadata.js';

/**
 * Výukové okno pro režim ?debug=trainer.
 * Zobrazuje rozhodnutí AI i pozorované lidské tahy a učí jednotlivé váhy.
 */
export function initAITrainingOverlay() {
    if (document.getElementById('ai-training-panel')) return;
    const panel = document.createElement('aside');
    panel.id = 'ai-training-panel';
    panel.className = 'ai-training-panel is-hidden';
    panel.setAttribute('aria-label', 'Výuka umělé inteligence');
    panel.innerHTML = `
        <div class="ai-training-header">
            <strong>VÝUKA AI</strong>
            <span id="ai-training-status">Čekám na rozhodnutí AI</span>
            <button id="ai-training-toggle" type="button" aria-label="Maximalizovat výuku AI" title="Maximalizovat">+</button>
        </div>
        <div class="ai-training-content">
        <label class="ai-training-history-label" for="ai-training-history">Rozhodnutí v tomto tahu</label>
        <select id="ai-training-history" class="ai-training-history" disabled><option>Čekám na rozhodnutí AI</option></select>
        <div id="ai-training-analysis" class="ai-training-analysis" aria-live="polite">
            Až přijde tah hráče nebo AI, zobrazím jeho rozbor.
        </div>
        <section id="ai-training-weight-review" class="ai-training-weight-review" aria-label="Otázky k jednotlivým vahám"></section>
        <form id="ai-training-form" class="ai-training-form">
            <label for="ai-training-instruction">Co měla AI udělat správně a proč?</label>
            <textarea id="ai-training-instruction" rows="3" maxlength="3000"
                placeholder="Např. Měla zachránit figurku na poli 12, protože soupeř ji může příštím hodem vyhodit."></textarea>
            <div class="ai-training-actions">
                <span id="ai-training-save-status" role="status"></span>
                <div class="ai-training-buttons">
                    <button id="ai-training-skip" type="button">PŘESKOČIT</button>
                    <button id="ai-training-correct" type="button" disabled>SPRÁVNĚ</button>
                    <button id="ai-training-submit" type="submit" disabled>ODESLAT</button>
                </div>
            </div>
        </form>
        </div>`;
    document.body.appendChild(panel);

    // Stejně jako debug=1 lze malé okno uchopit za hlavičku a přesunout.
    const header = panel.querySelector('.ai-training-header');
    header.style.cursor = 'grab';
    header.style.touchAction = 'none';
    let dragging = false;
    let pointerId = null;
    let offsetX = 0;
    let offsetY = 0;
    header.addEventListener('pointerdown', event => {
        if (event.target.closest('button')) return;
        if (event.button !== 0 && event.pointerType !== 'touch') return;
        const rect = panel.getBoundingClientRect();
        dragging = true;
        pointerId = event.pointerId;
        offsetX = event.clientX - rect.left;
        offsetY = event.clientY - rect.top;
        panel.style.left = Math.round(rect.left) + 'px';
        panel.style.top = Math.round(rect.top) + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        header.style.cursor = 'grabbing';
        header.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    });
    header.addEventListener('pointermove', event => {
        if (!dragging || event.pointerId !== pointerId) return;
        const viewport = window.visualViewport;
        const minX = viewport ? viewport.offsetLeft : 0;
        const minY = viewport ? viewport.offsetTop : 0;
        const width = viewport ? viewport.width : window.innerWidth;
        const height = viewport ? viewport.height : window.innerHeight;
        const left = Math.min(Math.max(minX, event.clientX - offsetX), Math.max(minX, minX + width - panel.offsetWidth));
        const top = Math.min(Math.max(minY, event.clientY - offsetY), Math.max(minY, minY + height - panel.offsetHeight));
        panel.style.left = Math.round(left) + 'px';
        panel.style.top = Math.round(top) + 'px';
    });
    const stopDragging = event => {
        if (!dragging || (event && event.pointerId !== pointerId)) return;
        dragging = false;
        pointerId = null;
        header.style.cursor = 'grab';
    };
    header.addEventListener('pointerup', stopDragging);
    header.addEventListener('pointercancel', stopDragging);
    header.addEventListener('lostpointercapture', stopDragging);

    const analysis = panel.querySelector('#ai-training-analysis');
    const status = panel.querySelector('#ai-training-status');
    const saveStatus = panel.querySelector('#ai-training-save-status');
    const form = panel.querySelector('#ai-training-form');
    const input = panel.querySelector('#ai-training-instruction');
    const submit = panel.querySelector('#ai-training-submit');
    const skip = panel.querySelector('#ai-training-skip');
    const correct = panel.querySelector('#ai-training-correct');
    let currentDecision = null;
    let decisionHistory = [];
    const reviewedDecisionIds = new Set();
    let preferredPieceId = null;
    let csrfToken = null;
    let saving = false;
    let expanded = false;

    const setSubmitState = () => {
        submit.disabled = saving || !currentDecision || (!input.value.trim() && preferredPieceId === null);
        skip.disabled = saving || !currentDecision;
        correct.disabled = saving || !currentDecision;
    };

    const toggleButton = panel.querySelector('#ai-training-toggle');
    const setExpanded = value => {
        expanded = Boolean(value);
        panel.classList.toggle('is-collapsed', !expanded);
        toggleButton.textContent = expanded ? '−' : '+';
        toggleButton.setAttribute('aria-label', expanded ? 'Minimalizovat výuku AI' : 'Maximalizovat výuku AI');
        toggleButton.title = expanded ? 'Minimalizovat' : 'Maximalizovat';
        toggleButton.setAttribute('aria-expanded', String(expanded));
    };
    toggleButton.addEventListener('click', () => setExpanded(!expanded));
    setExpanded(true);

    // Panel se ukáže až ve chvíli, kdy je skutečně viditelná herní deska.
    const syncBoardVisibility = () => {
        const screen = document.getElementById('game-screen');
        const board = screen?.querySelector('#game-container');
        const visible = Boolean(screen && !screen.classList.contains('hidden') &&
            board && board.childElementCount > 0 &&
            screen.getClientRects().length && board.getClientRects().length);
        panel.classList.toggle('is-hidden', !visible);
    };
    const visibilityObserver = new MutationObserver(syncBoardVisibility);
    visibilityObserver.observe(document.documentElement, {
        subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style']
    });
    window.addEventListener('resize', syncBoardVisibility, { passive: true });
    syncBoardVisibility();

    const addText = (parent, tag, className, value) => {
        const element = document.createElement(tag);
        if (className) element.className = className;
        element.textContent = String(value ?? '');
        parent.appendChild(element);
        return element;
    };

    function positionLabel(steps, player, trackLength) {
        const value = Number(steps);
        if (!Number.isFinite(value) || value < 0) return 'základna';
        if (value >= trackLength) return 'domeček D' + (value - trackLength + 1);
        return 'pole ' + (((Number(player?.start || 0) + value) % trackLength) + 1);
    }

    function cleanExplanation(value) {
        return String(value || '')
            .replace(/[,;.]?\s*protože jsem v závod(?:ě|u)\\s+vpřed[uě]\\.?/gi, '')
            .replace(/\s{2,}/g, ' ')
            .replace(/\s+([,.])/g, '$1')
            .trim();
    }

    const weightReview = panel.querySelector('#ai-training-weight-review');
    const weightCursorKey = 'clovece-trainer-weight-cursors-v1';

    function completeReview(detail, selectedPieceId = null) {
        if (!detail || detail.reviewCompleted) return;
        detail.reviewCompleted = true;
        const decisionId = String(detail.decisionId || detail.id || '');
        if (decisionId) reviewedDecisionIds.add(decisionId);
        status.textContent = 'Hodnocení dokončeno – tah může pokračovat.';
        const hasSelection = selectedPieceId !== null && selectedPieceId !== undefined &&
            Number.isInteger(Number(selectedPieceId));
        window.dispatchEvent(new CustomEvent('clovece:ai-training-review-complete', {
            detail: { decisionId, selectedPieceId: hasSelection ? Number(selectedPieceId) : null }
        }));
    }

    function renderWeightReview(detail) {
        weightReview.replaceChildren();
        const title = addText(weightReview, 'div', 'ai-training-section-title', 'UČENÍ JEDNOTLIVÝCH PROMĚNNÝCH');
        const questions = Array.isArray(detail.weightReviewQuestions)
            ? detail.weightReviewQuestions
            : (() => {
                let cursors = {};
                try { cursors = JSON.parse(localStorage.getItem(weightCursorKey) || '{}'); } catch {}
                const generated = buildAIWeightReviewQuestions(detail, cursors);
                generated.forEach(question => { cursors[question.channel] = question.nextCursor; });
                try { localStorage.setItem(weightCursorKey, JSON.stringify(cursors)); } catch {}
                detail.weightReviewQuestions = generated;
                return generated;
            })();

        if (!questions.length) {
            addText(weightReview, 'p', 'ai-training-weight-empty',
                'V tomto rozhodnutí není mezi legálními variantami dostatečný rozdíl v signálech pro samostatné hodnocení vah.');
            completeReview(detail, preferredPieceId);
            return;
        }

        const isHumanMove = detail.strategyVersion === 'human-move-observation-v1';
        addText(weightReview, 'p', 'ai-training-weight-intro',
            (isHumanMove ? 'Ty jsi zvolil tento tah. ' : 'AI vybrala tento tah. ') +
            'U každé proměnné urči, zda má posuzovaný tah podporovat. Odpověď změní pouze uvedenou váhu.');
        questions.forEach(question => {
            const card = document.createElement('article');
            card.className = 'ai-training-weight-card';
            card.dataset.weightId = String(question.id);
            addText(card, 'strong', 'ai-training-weight-name',
                '#' + question.id + ' · ' + question.name);
            addText(card, 'div', 'ai-training-weight-description', question.description);
            addText(card, 'div', 'ai-training-weight-meta',
                'Kanál: ' + question.channelName +
                ' · hodnota: ' + getAIWeight(question.id) +
                ' · rozdíl signálu vybraného tahu: ' +
                (question.signalDelta > 0 ? '+' : '') + question.signalDelta);
            addText(card, 'div', 'ai-training-weight-question',
                'Má tato proměnná podpořit právě posuzovaný tah?');
            const actions = document.createElement('div');
            actions.className = 'ai-training-weight-actions';
            const result = addText(card, 'span', 'ai-training-weight-result', '');
            const previousAnswer = detail.weightReviewAnswers?.[String(question.id)];
            if (previousAnswer) {
                card.dataset.answered = previousAnswer;
                result.textContent = previousAnswer === 'unknown' ? 'Nevím – váha zůstala beze změny.' : 'Tato proměnná už byla v tomto rozhodnutí vyhodnocena.';
            }
            const answer = async value => {
                if (saving || card.dataset.answered) return;
                if (value === 'unknown') {
                    detail.weightReviewAnswers = detail.weightReviewAnswers || {};
                    detail.weightReviewAnswers[String(question.id)] = 'unknown';
                    card.dataset.answered = 'unknown';
                    result.textContent = 'Nevím – váha zůstává beze změny.';
                    actions.querySelectorAll('button').forEach(button => { button.disabled = true; });
                    if (questions.every(item => detail.weightReviewAnswers[String(item.id)])) completeReview(detail, preferredPieceId);
                    return;
                }
                saving = true;
                actions.querySelectorAll('button').forEach(button => { button.disabled = true; });
                setSubmitState();
                const before = getAIWeight(question.id);
                result.textContent = 'Ukládám změnu váhy…';
                try {
                    const payload = await saveAIWeightFeedback({
                        id: question.id,
                        answer: value,
                        signalDelta: question.signalDelta,
                        currentValue: before,
                        decisionId: String(detail.decisionId || detail.id || '')
                    });
                    setAIWeightOverrides(payload.values || {});
                    detail.weightReviewAnswers = detail.weightReviewAnswers || {};
                    detail.weightReviewAnswers[String(question.id)] = value;
                    card.dataset.answered = value;
                    result.textContent = 'Uloženo ihned: ' + before + ' → ' + payload.after +
                        ' · celkem úprav vah: ' + payload.feedbackCount;
                    saveStatus.textContent = 'Váha #' + question.id + ' změněna a uložena na server.';
                    if (questions.every(item => detail.weightReviewAnswers[String(item.id)])) completeReview(detail, preferredPieceId);
                } catch (error) {
                    result.textContent = error.message || 'Změnu váhy se nepodařilo uložit.';
                    actions.querySelectorAll('button').forEach(button => { button.disabled = false; });
                } finally {
                    saving = false;
                    setSubmitState();
                }
            };
            [['ANO','yes'],['NE','no'],['NEVÍM','unknown']].forEach(([label,value]) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = label;
                button.disabled = Boolean(previousAnswer);
                button.addEventListener('click', () => answer(value));
                actions.appendChild(button);
            });
            card.appendChild(actions);
            weightReview.appendChild(card);
        });
    }

    function renderDecision(detail) {
        setExpanded(true);
        currentDecision = detail;
        preferredPieceId = Number.isInteger(Number(detail.decision?.preferredPieceId)) ? Number(detail.decision.preferredPieceId) : null;
        saveStatus.textContent = '';
        analysis.replaceChildren();
        const selfTest = window.__cloveceDebugSelfTest;
        if (selfTest) {
            addText(analysis, 'div', selfTest.ok ? 'ai-training-learned' : 'ai-training-knowledge-error',
                'AUTOMATICKÝ TEST AI: ' + selfTest.summary);
        }

        const game = detail.game || {};
        const decision = detail.decision || {};
        const result = detail.result || {};
        const player = (game.players || []).find(item => Number(item.id) === Number(game.currentPlayer));
        const isHumanMove = detail.strategyVersion === 'human-move-observation-v1';
        addText(analysis, 'div', 'ai-training-player', (detail.aiName || player?.name || 'AI') +
            ' · tah ' + (game.turnNumber ?? '—') + ' · hod ' + (game.diceValue ?? '—'));
        if (!detail.result) {
            addText(analysis, 'div', 'ai-training-pending',
                isHumanMove
                    ? 'Tvoje zvolená figurka zatím neudělala tah. Po hodnocení se tah provede.'
                    : (detail.decision?.ruleForced ? 'Tah je určen pravidly a provede se automaticky.' : 'AI zatím neudělala tah. Čeká na tvoje hodnocení proměnných.'));
        }

        const usedInstructions = Array.isArray(decision.usedInstructions) ? decision.usedInstructions : [];
        if (decision.trainedKnowledge && usedInstructions.length) {
            const ids = usedInstructions.map(item => String(item.id || '').slice(0, 8)).filter(Boolean);
            addText(analysis, 'div', 'ai-training-learned',
                'NAUČENO · použita instrukce ' + (ids.join(', ') || 'bez ID'));
        }
        if (decision.knowledgeError) {
            addText(analysis, 'div', 'ai-training-knowledge-error',
                'Načtení výuky se nezdařilo: ' + decision.knowledgeError);
        }

        addText(analysis, 'div', 'ai-training-section-title', isHumanMove ? 'TVŮJ ZVOLENÝ TAH' : 'CO AI VYBRALA');
        addText(analysis, 'p', 'ai-training-explanation',
            cleanExplanation(decision.explanation) || 'AI zatím nemá taktické zkušenosti. Vybrala legální tah podle aktuálního způsobu výběru.');

        const selected = decision.selectedPieceId;
        if (selected !== null && selected !== undefined) {
            addText(analysis, 'p', 'ai-training-selected', 'Vybraná figurka: ' + (Number(selected) + 1));
        }

        const candidates = Array.isArray(decision.candidates) ? decision.candidates : [];
        if (candidates.length) {
            addText(analysis, 'div', 'ai-training-section-title', 'OSTATNÍ MOŽNOSTI');
            const list = document.createElement('ul');
            list.className = 'ai-training-candidates';
            candidates.forEach(candidate => {
                const pieceId = Number(candidate.pieceId);
                const chosen = pieceId === Number(selected);
                const taught = preferredPieceId === pieceId;
                const reason = candidate.reason || candidate.reasons?.join(', ') || 'bez taktického hodnocení';
                const item = document.createElement('li');
                item.className = (chosen ? 'is-selected ' : '') + (taught ? 'is-teaching-target' : '');
                const choose = document.createElement('button');
                choose.type = 'button';
                choose.className = 'ai-training-candidate-choice';
                choose.textContent = 'Učit: figurka ' + (pieceId + 1) + (chosen ? ' (zvolená)' : '') + (taught ? ' ✓' : '');
                choose.disabled = saving || Object.keys(currentDecision.weightReviewAnswers || {}).length > 0;
                choose.addEventListener('click', () => {
                    preferredPieceId = pieceId;
                    currentDecision.decision.preferredPieceId = pieceId;
                    currentDecision.weightReviewQuestions = null;
                    currentDecision.weightReviewAnswers = {};
                    renderDecision(currentDecision);
                    input.focus();
                    setSubmitState();
                });
                item.appendChild(choose);
                const from = candidate.fromSteps === undefined ? null : positionLabel(candidate.fromSteps, player, Number(game.trackLength || game.boardSize || 40));
                const to = candidate.toSteps === undefined ? null : positionLabel(candidate.toSteps, player, Number(game.trackLength || game.boardSize || 40));
                const score = candidate.score !== null && candidate.score !== undefined && Number.isFinite(Number(candidate.score)) ? (decision.trainedKnowledge ? ' · naučené hlasy ' + Number(candidate.score).toFixed(0) : ' · skóre ' + Number(candidate.score).toFixed(3)) : '';
                addText(item, 'span', '', 'F' + (pieceId + 1) + (from && to ? ' · ' + from + ' → ' + to : '') + score + ' · ' + cleanExplanation(reason));
                list.appendChild(item);
            });
            analysis.appendChild(list);
        }

        // Podrobný rozbor je pouze ve vývojovém prostředí. Rozlišujeme přesnou
        // simulaci legálních možností od odhadu toho, co soupeř skutečně zvolí.
        const selectedCandidate = candidates.find(item => Number(item.pieceId) === Number(selected));
        const factors = decision.selectedWeightFactors || selectedCandidate?.weightFactors || {};
        addText(analysis, 'div', 'ai-training-section-title', 'PROČ AI VYBRALA TENTO TAH');
        if (decision.score !== null && decision.score !== undefined && Number.isFinite(Number(decision.score))) {
            addText(analysis, 'p', 'ai-training-explanation', (decision.trainedKnowledge ? 'Naučené hlasování: ' : 'Strategické skóre: ') + Number(decision.score).toFixed(decision.trainedKnowledge ? 0 : 4));
        }
        if (decision.trainedKnowledge) {
            addText(analysis, 'p', 'ai-training-learned',
                'Tento tah vybrala naučená paměť při přesné shodě situace. Níže uvedené váhy jsou pouze srovnávací rozbor, nikoli důvod tohoto konkrétního výběru.');
        }
        const contributions = factors.weightContributions || {};
        const weightValues = decision.weightConfig?.values || {};
        const signals = factors.weightSignalsByName || {};
        const weightNames = {
            progressToGoal: 'Postup k cíli',
            finishPiece: 'Dokončení figurky',
            captureOpponent: 'Vyhození soupeře',
            protectOwn: 'Ochrana vlastních figurek',
            threatenOpponent: 'Ohrožení soupeře',
            deployPiece: 'Nasazení figurky',
            homeProgress: 'Postup v domečku',
            bonusContinuation: 'Bonusový hod',
            startFieldRisk: 'Riziko vyhození',
            flexibility: 'Strategická flexibilita'
        };
        const weightRows = Object.entries(contributions);
        if (weightRows.length) {
            const list = document.createElement('ul');
            list.className = 'ai-training-candidates';
            weightRows.forEach(([key, value]) => {
                const signal = signals[key] ?? factors[key];
                const item = document.createElement('li');
                const weight = weightValues[key];
                item.textContent = (weightNames[key] || key) +
                    (weight !== undefined ? ' · váha ' + Number(weight).toFixed(2) : '') +
                    (Number.isFinite(Number(signal)) ? ' × signál ' + Number(signal).toFixed(3) : '') +
                    ' = ' + Number(value).toFixed(4);
                list.appendChild(item);
            });
            analysis.appendChild(list);
        } else if (decision.trainedKnowledge) {
            addText(analysis, 'p', 'ai-training-explanation', 'Výběr ovlivnila přesná shoda s naučenou situací; strategické váhy tento výběr nepřepsaly.');
        }

        const trackLengthForForecast = Number(game.trackLength || game.boardSize || 40);
        const diceForecast = Array.isArray(decision.diceSimulation) && decision.diceSimulation.length
            ? decision.diceSimulation : (Array.isArray(factors.diceSimulation) ? factors.diceSimulation : []);
        addText(analysis, 'div', 'ai-training-section-title', 'VÝPOČET VŠECH 6 MOŽNÝCH PŘÍŠTÍCH HODŮ');
        if (diceForecast.length) {
            const diceList = document.createElement('ul');
            diceList.className = 'ai-training-candidates';
            diceForecast.forEach(outcome => {
                const item = document.createElement('li');
                const flags = [
                    outcome.retrying ? 'další pokus' : '',
                    outcome.bonusRoll ? 'bonusový hod' : '',
                    outcome.capture ? 'lze vyhodit soupeře' : '',
                    outcome.finish ? 'možné dokončení' : ''
                ].filter(Boolean).join(' · ');
                const options = (outcome.options || []).map(option => {
                    const from = positionLabel(option.fromSteps, player, trackLengthForForecast);
                    const to = positionLabel(option.toSteps, player, trackLengthForForecast);
                    const capture = option.captures
                        ? (option.captures.ownPiece ? ' (výměna vlastní figurky)' : ' (vyhození hráče ' +
                            ((game.players || []).find(p => Number(p.id) === Number(option.captures.playerId))?.name || (Number(option.captures.playerId) + 1)) +
                            ', F' + (Number(option.captures.pieceId) + 1) + ')') : '';
                    return 'F' + (Number(option.pieceId) + 1) + ': ' + from + ' → ' + to + capture;
                });
                item.textContent = 'Kostka ' + outcome.dice + ': ' + outcome.legalMoveCount +
                    ' legálních tahů' + (flags ? ' · ' + flags : '') +
                    (options.length ? ' · ' + options.join('; ') : ' · bez tahu');
                diceList.appendChild(item);
            });
            analysis.appendChild(diceList);
        } else {
            addText(analysis, 'p', 'ai-training-explanation', 'Pro tuto situaci nebyla simulace příštích hodů dostupná.');
        }

        const opponentForecast = Array.isArray(decision.opponentResponses) && decision.opponentResponses.length
            ? decision.opponentResponses : (Array.isArray(factors.opponentResponses) ? factors.opponentResponses : []);
        addText(analysis, 'div', 'ai-training-section-title', 'MOŽNÉ REAKCE SOUPEŘŮ');
        if (opponentForecast.length) {
            opponentForecast.forEach(opponent => {
                const details = document.createElement('details');
                details.className = 'ai-training-opponent';
                const summary = document.createElement('summary');
                summary.textContent = opponent.playerName + (opponent.canCaptureTarget
                    ? ' · existuje možnost vyhození naší figurky' : ' · bez nalezeného okamžitého vyhození');
                details.appendChild(summary);
                (opponent.diceOutcomes || []).forEach(outcome => {
                    const line = document.createElement('div');
                    const options = (outcome.options || []).map(option => {
                        const from = positionLabel(option.fromSteps, opponent, trackLengthForForecast);
                        const to = positionLabel(option.toSteps, opponent, trackLengthForForecast);
                        return 'F' + (Number(option.pieceId) + 1) + ' ' + from + ' → ' + to +
                            (option.capturesTarget ? ' [VYHODÍ NAŠI F' + (Number(selected) + 1) + ']' : '') +
                            (option.bonusRoll ? ' [bonusový hod]' : '');
                    });
                    line.textContent = 'Hod ' + outcome.dice + ': ' +
                        (options.length ? options.join('; ') : outcome.retrying ? 'opakovaný pokus' : 'bez legálního tahu');
                    details.appendChild(line);
                });
                analysis.appendChild(details);
            });
            addText(analysis, 'p', 'ai-training-explanation',
                'Jde o všechny nalezené legální odpovědi po jednom hodu soupeře, nikoli o tvrzení, že soupeř určitě zvolí konkrétní tah.');
        } else {
            addText(analysis, 'p', 'ai-training-explanation', 'Pro vybranou figurku není na hlavní trase žádná okamžitá soupeřova reakce k výpočtu.');
        }

        renderWeightReview(detail);

        const move = result.move || {};
        if (move.pieceId !== undefined) {
            addText(analysis, 'div', 'ai-training-section-title', 'VÝSLEDEK TAHU');
            const trackLength = Number(game.trackLength || game.boardSize || 40);
            const beforePlayer = (game.piecesBefore || [])[Number(game.currentPlayer)];
            const beforePiece = beforePlayer?.pieces?.[Number(move.pieceId)];
            const afterPlayer = (result.piecesAfter || [])[Number(game.currentPlayer)];
            const afterPiece = afterPlayer?.pieces?.[Number(move.pieceId)];
            let outcome = 'Figurka ' + (Number(move.pieceId) + 1);
            if (beforePiece && afterPiece) {
                outcome += ': ' + positionLabel(beforePiece.steps, player, trackLength) +
                    ' → ' + positionLabel(afterPiece.steps, player, trackLength);
            }
            if (move.captured) outcome += move.captured.ownPiece
                ? ' – výměna vlastní figurky na startu'
                : ' – vyhození soupeřovy figurky';
            if (move.finishedNow) outcome += ' – vstup do domečku';
            addText(analysis, 'p', 'ai-training-result', outcome);
        }

        const pieces = game.piecesBefore || [];
        if (pieces.length) {
            const snapshot = pieces.map((group, playerId) => {
                const playerName = (game.players || []).find(item => Number(item.id) === playerId)?.name || ('Hráč ' + (playerId + 1));
                return playerName + ': ' + (group.pieces || []).map((piece, pieceId) =>
                    'F' + (pieceId + 1) + '=' + (Number(piece.steps) < 0 ? 'základna' :
                        Number(piece.steps) >= Number(game.boardSize || game.trackLength) ? 'domeček' :
                            'pole ' + ((((game.players || [])[playerId]?.start || 0) + Number(piece.steps)) % Number(game.boardSize || game.trackLength) + 1))
                ).join(', ');
            }).join('\\n');
            addText(analysis, 'details', 'ai-training-position', snapshot);
        }

        status.textContent = decision.ruleForced ? 'Tah je vynucen pravidlem hry.' : 'Rozhodnutí zaznamenáno – čekám na tvoji opravu.';
        input.value = '';
        setSubmitState();
        syncBoardVisibility();
    }

    async function getToken() {
        const response = await fetch('debug/ai-training.php?action=token', {
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { Accept: 'application/json' }
        });
        const payload = await response.json();
        if (!response.ok || !payload.success || !payload.token) {
            throw new Error(payload.error || 'Nepodařilo se připravit bezpečné uložení instrukce.');
        }
        csrfToken = payload.token;
    }

    input.addEventListener('input', setSubmitState);
    skip.addEventListener('click', () => {
        if (!currentDecision || saving) return;
        completeReview(currentDecision, preferredPieceId);
        reviewedDecisionIds.add(String(currentDecision.decisionId || currentDecision.id));
        currentDecision = null;
        preferredPieceId = null;
        input.value = '';
        updateDecisionHistory();
        saveStatus.textContent = 'Bez instrukce – nic nebylo uloženo.';
        status.textContent = 'Rozhodnutí přeskočeno.';
        setSubmitState();
    });
    async function saveFeedback(feedbackType) {
        const feedbackText = input.value.trim();
        const instruction = feedbackType === 'correction' ? feedbackText : '';
        const note = feedbackType === 'positive' ? feedbackText : '';
        if (!currentDecision || saving || (feedbackType === 'correction' && !instruction && preferredPieceId === null)) return;
        const decisionToSave = JSON.parse(JSON.stringify(currentDecision));
        if (feedbackType === 'correction' && preferredPieceId !== null) decisionToSave.decision.preferredPieceId = preferredPieceId;
        saving = true;
        setSubmitState();
        saveStatus.textContent = 'Ukládám…';
        try {
            if (!csrfToken) await getToken();
            const response = await fetch('debug/ai-training.php', {
                method: 'POST',
                credentials: 'same-origin',
                cache: 'no-store',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-Token': csrfToken
                },
                body: JSON.stringify({
                    feedbackType,
                    instruction: instruction || null,
                    note: note || null,
                    context: decisionToSave
                })
            });
            const payload = await response.json();
            if (!response.ok || !payload.success || !payload.id) {
                throw new Error(payload.error || 'Záznam se nepodařilo uložit.');
            }
            completeReview(currentDecision, preferredPieceId);
            reviewedDecisionIds.add(String(decisionToSave.decisionId || decisionToSave.id));
            currentDecision = null;
            preferredPieceId = null;
            input.value = '';
            updateDecisionHistory();
            saveStatus.textContent = (feedbackType === 'positive' ? 'Potvrzeno jako správné · ' : 'Oprava uložena · ') + payload.id;
            status.textContent = feedbackType === 'positive'
                ? 'Správné rozhodnutí bylo uloženo jako pozitivní příklad.'
                : 'Instrukce byla uložena jako samostatný soubor.';
        } catch (error) {
            saveStatus.textContent = error.message || 'Chyba při ukládání.';
        } finally {
            saving = false;
            setSubmitState();
        }
    }

    form.addEventListener('submit', async event => {
        event.preventDefault();
        await saveFeedback('correction');
    });
    correct.addEventListener('click', () => saveFeedback('positive'));

    const historySelect = panel.querySelector('#ai-training-history');
    function updateDecisionHistory(preferredId = null, forceRender = false) {
        const previous = preferredId || currentDecision?.decisionId || historySelect.value;
        historySelect.replaceChildren();
        decisionHistory.forEach(item => {
            const option = document.createElement('option');
            option.value = String(item.decisionId || item.id);
            option.textContent = 'Hod ' + (item.game?.diceValue ?? '?') + ' · figurka ' +
                (Number(item.decision?.selectedPieceId ?? -1) + 1) +
                (reviewedDecisionIds.has(option.value) ? ' · vyhodnoceno' : '');
            historySelect.appendChild(option);
        });
        historySelect.disabled = decisionHistory.length === 0;
        if (!decisionHistory.length) return;
        const preferred = decisionHistory.find(item => String(item.decisionId || item.id) === String(previous)
            && !reviewedDecisionIds.has(String(item.decisionId || item.id)));
        const target = preferred || [...decisionHistory].reverse().find(item =>
            !reviewedDecisionIds.has(String(item.decisionId || item.id)));
        if (!target) {
            currentDecision = null;
            analysis.textContent = 'Všechna rozhodnutí v tomto tahu už byla vyhodnocena.';
            status.textContent = 'Hodnocení tohoto tahu je dokončeno.';
            setSubmitState();
            return;
        }
        historySelect.value = String(target.decisionId || target.id);
        if (forceRender || !currentDecision || String(currentDecision.decisionId || currentDecision.id) !== historySelect.value) renderDecision(target);
    }
    historySelect.addEventListener('change', () => {
        const selectedItem = decisionHistory.find(item => String(item.decisionId || item.id) === historySelect.value);
        if (selectedItem) renderDecision(selectedItem);
    });
    window.addEventListener('clovece:ai-training-decisions', event => {
        const humanHistory = decisionHistory.filter(item => {
            const player = (item.game?.players || []).find(entry => Number(entry.id) === Number(item.game?.currentPlayer));
            return player?.type === 'human' && !reviewedDecisionIds.has(String(item.decisionId || item.id));
        });
        const incoming = Array.isArray(event.detail?.decisions) ? event.detail.decisions : [];
        decisionHistory = [...humanHistory, ...incoming].slice(-50);
        decisionHistory.forEach(item => { item.id = item.id || item.decisionId || (Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)); });
        updateDecisionHistory(event.detail?.currentId || null, true);
    });
    window.addEventListener('clovece:ai-training-decision', event => {
        const detail = event.detail;
        if (!detail || typeof detail !== 'object') return;
        const key = String(detail.decisionId || detail.id || '');
        const index = decisionHistory.findIndex(item => String(item.decisionId || item.id) === key);
        if (index >= 0) {
            const previous = decisionHistory[index];
            detail.weightReviewQuestions ||= previous.weightReviewQuestions;
            detail.weightReviewAnswers ||= previous.weightReviewAnswers;
            detail.reviewCompleted ||= previous.reviewCompleted;
            decisionHistory[index] = detail;
        } else decisionHistory.push(detail);
        if (detail.result) renderDecision(detail);
        else updateDecisionHistory(key, true);
    });

    getToken().catch(error => {
        saveStatus.textContent = error.message;
    });
}
