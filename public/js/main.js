import * as THREE from 'three';
import { Game } from './game.js';
import { LANGUAGE_LEVELS, LEXICAL_TOPICS, GRAMMAR_TOPICS } from './questions.js';

const MENU_STATE_KEY = 'flammen_menu_state_v2';
const BRIDGE_COUNT = 8;
const RITUAL_SLOTS = Array.from({ length: BRIDGE_COUNT }, (_, index) => ({
    id: `bridge-${index + 1}`,
    title: `Мост ${index + 1}`,
    role: `Перемычка ${index + 1}`,
    order: 'против часовой'
}));

function isWortstellungTopic(grammarTopic) {
    return typeof grammarTopic === 'string' && grammarTopic.includes('Wortstellung');
}

const rootElement = document.querySelector('#root');

const renderWidth = () => Math.floor(window.innerWidth);
const renderHeight = () => Math.floor(window.innerHeight);
const qualityParam = new URLSearchParams(location.search).get('quality') || 'auto';
const lowPowerDevice = qualityParam === 'low';
const pixelRatioCap = qualityParam === 'low' ? 1.0 : 1.5;

const camera = new THREE.PerspectiveCamera(60, renderWidth() / renderHeight(), 0.1, 500);
camera.position.set(20, 18, 20);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07050b);
scene.fog = new THREE.Fog(0x07050b, 30, 90);

const renderer = new THREE.WebGLRenderer({
    antialias: !lowPowerDevice,
    powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap));
renderer.setSize(renderWidth(), renderHeight());
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
rootElement.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0x4a5a78, 0.45));
const moon = new THREE.DirectionalLight(0x9bb0d8, 0.85);
moon.position.set(20, 30, 10);
scene.add(moon);
const fill = new THREE.DirectionalLight(0x554466, 0.3);
fill.position.set(-15, 20, -10);
scene.add(fill);

window.addEventListener('resize', () => {
    const w = renderWidth();
    const h = renderHeight();
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
});

let game;

const ui = {
    intro: document.querySelector('#intro'),
    overlay: document.querySelector('#overlay'),
    hud: document.querySelector('#hud'),
    fps: document.querySelector('#fps'),
    message: document.querySelector('#message-banner'),
    questionPanel: document.querySelector('#question-panel'),
    questionMode: document.querySelector('#question-mode'),
    questionTopic: document.querySelector('#question-topic-label'),
    questionText: document.querySelector('#question-text'),
    questionOptions: document.querySelector('#question-options'),
    questionFeedback: document.querySelector('#question-feedback'),
    peekPanel: document.querySelector('#peek-panel'),
    peekRows: document.querySelector('#peek-rows'),
    startButton: document.querySelector('#start-btn'),
    startStatus: document.querySelector('#start-status'),
    playerName: document.querySelector('#player-name'),
    steps: Array.from(document.querySelectorAll('.setup-step')),
    progressSteps: Array.from(document.querySelectorAll('.progress-step')),
    levelButtons: document.querySelector('#level-buttons'),
    lexicalGrid: document.querySelector('#lexical-grid'),
    ritualSlots: document.querySelector('#ritual-slots'),
    grammarPicker: document.querySelector('#grammar-picker'),
    peekButton: document.querySelector('#peek-btn'),
    messageTimer: 0,
    ready: false,
    optionNodes: [],
    selectedStep: 1,
    selectedLevel: null,
    selectedLexical: null,
    selectedGrammar: null,
    selectedSlotIndex: null,
    slotAssignments: Array(RITUAL_SLOTS.length).fill(null),

    bind(targetGame) {
        game = targetGame;
        this.loadMenuState();
        this.populateMenu();
        this.startButton.addEventListener('click', () => this.requestStart());
        this.peekButton.addEventListener('click', () => game.peekTimers());
        document.querySelector('#to-step2-btn').addEventListener('click', () => this.showStep(2));
        document.querySelector('#back-to-step1').addEventListener('click', () => this.showStep(1));
        document.querySelector('#back-to-step2').addEventListener('click', () => this.showStep(2));
        document.querySelector('#back-to-step3').addEventListener('click', () => this.showStep(3));

        this.questionPanel.addEventListener('pointerdown', (event) => {
            if (event.button !== 0 || !game.currentQuestion) return;
            game.setAnswerSlow(true);
            event.preventDefault();
        });

        this.questionPanel.addEventListener('pointerup', (event) => {
            if (!game.currentQuestion) return;
            game.setAnswerSlow(false);
            event.preventDefault();
        });

        window.addEventListener('pointerup', () => {
            if (game.currentQuestion) game.setAnswerSlow(false);
        });

        this.playerName.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                this.showStep(2);
            }
        });
        this.playerName.addEventListener('input', () => this.saveMenuState());
    },

    loadMenuState() {
        try {
            const savedName = localStorage.getItem('flammen_player_name');
            const raw = localStorage.getItem(MENU_STATE_KEY);
            if (savedName) this.playerName.value = savedName;
            if (!raw) return;

            const state = JSON.parse(raw);
            if (LANGUAGE_LEVELS.includes(state.selectedLevel)) this.selectedLevel = state.selectedLevel;
            if (LEXICAL_TOPICS.includes(state.selectedLexical)) this.selectedLexical = state.selectedLexical;
            if (Array.isArray(state.slotAssignments)) {
                this.slotAssignments = Array.from({ length: RITUAL_SLOTS.length }, (_, index) => {
                    const topic = state.slotAssignments[index];
                    return GRAMMAR_TOPICS.includes(topic) ? topic : null;
                });
            }
            if (Number.isInteger(state.selectedStep)) {
                this.selectedStep = Math.max(1, Math.min(4, state.selectedStep));
            }
        } catch (error) {
            // Local storage is optional.
        }
    },

    saveMenuState() {
        try {
            const playerName = this.playerName.value.trim();
            if (playerName) localStorage.setItem('flammen_player_name', playerName);
            localStorage.setItem(MENU_STATE_KEY, JSON.stringify({
                selectedLevel: this.selectedLevel,
                selectedLexical: this.selectedLexical,
                selectedStep: this.selectedStep,
                slotAssignments: this.slotAssignments
            }));
        } catch (error) {
            // Local storage is optional.
        }
    },

    populateMenu() {
        this.renderLevelButtons();
        this.renderLexicalGrid();
        this.renderSlots();
        this.renderGrammarPicker();
        this.showStep(this.getRestoredStep());
        this.updateStartButton();
    },

    getRestoredStep() {
        if (this.selectedStep >= 4 && this.selectedLevel && this.selectedLexical) return 4;
        if (this.selectedStep >= 3 && this.selectedLevel) return 3;
        if (this.selectedStep >= 2) return 2;
        return 1;
    },

    renderLevelButtons() {
        this.levelButtons.innerHTML = '';
        const labels = {
            A1: 'Начальный',
            A2: 'Базовый',
            B1: 'Средний',
            B2: 'Выше среднего'
        };
        for (const level of LANGUAGE_LEVELS) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'level-btn';
            button.dataset.level = level;
            button.innerHTML = `<span class="level-code">${level}</span><span class="level-desc">${labels[level] || ''}</span>`;
            button.addEventListener('click', () => {
                this.selectedLevel = level;
                this.renderLevelButtons();
                this.updateStartButton();
                this.saveMenuState();
                this.showStep(3);
            });
            button.classList.toggle('selected', this.selectedLevel === level);
            this.levelButtons.appendChild(button);
        }
    },

    renderLexicalGrid() {
        this.lexicalGrid.innerHTML = '';
        for (const topic of LEXICAL_TOPICS) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'lexical-btn';
            button.textContent = topic;
            button.classList.toggle('selected', this.selectedLexical === topic);
            button.addEventListener('click', () => {
                this.selectedLexical = topic;
                this.renderLexicalGrid();
                this.updateStartButton();
                this.saveMenuState();
                this.showStep(4);
            });
            this.lexicalGrid.appendChild(button);
        }
    },

    setReady(isReady) {
        this.ready = isReady;
        this.startStatus.textContent = isReady ? 'Храм готов к забегу.' : 'Загрузка храма...';
        this.updateStartButton();
    },

    getSettings() {
        const playerName = this.playerName.value.trim() || 'Spieler';
        try { localStorage.setItem('flammen_player_name', playerName); } catch (error) {}
        this.saveMenuState();
        return {
            playerName,
            langLevel: this.selectedLevel || 'A2',
            lexicalTopic: this.selectedLexical || LEXICAL_TOPICS[0],
            grammarSlots: this.slotAssignments.map((grammarTopic, index) => ({
                grammarTopic,
                bridgeIndex: index,
                isWortstellung: isWortstellungTopic(grammarTopic)
            }))
        };
    },

    requestStart() {
        if (!this.ready || !this.isMenuComplete()) {
            this.startStatus.textContent = this.ready ? 'Заполните все мосты перед стартом.' : 'Загрузка храма...';
            return;
        }
        game.startRun(this.getSettings());
    },

    showStep(step) {
        this.selectedStep = step;
        this.steps.forEach((node) => {
            node.classList.toggle('hidden', node.id !== `setup-step${step}`);
        });
        this.progressSteps.forEach((node) => {
            node.classList.toggle('active', node.dataset.progressStep === String(step));
        });
        this.saveMenuState();
    },

    renderSlots() {
        this.ritualSlots.innerHTML = '';
        RITUAL_SLOTS.forEach((slot, index) => {
            const grammar = this.slotAssignments[index];
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'ritual-slot';
            button.dataset.slot = String(index);
            button.classList.toggle('selected-slot', this.selectedSlotIndex === index);
            button.innerHTML =
                `<div class="slot-bonus">${slot.role}</div>` +
                `<div class="slot-topic">${grammar || slot.title}</div>` +
                `<div class="slot-grammar">${grammar ? `${slot.order}, тема моста` : 'выберите грамматику для моста'}</div>`;
            button.addEventListener('click', () => {
                if (this.selectedGrammar) {
                    this.assignGrammarToSlot(index, this.selectedGrammar);
                    return;
                }
                this.selectedSlotIndex = this.selectedSlotIndex === index ? null : index;
                this.saveMenuState();
                this.renderSlots();
                this.renderGrammarPicker();
            });
            this.ritualSlots.appendChild(button);
        });
    },

    renderGrammarPicker() {
        this.grammarPicker.innerHTML = '';
        for (const topic of GRAMMAR_TOPICS) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'grammar-tag';
            button.textContent = topic;
            button.classList.toggle('selected-grammar', this.selectedGrammar === topic);
            button.addEventListener('click', () => {
                if (this.selectedSlotIndex !== null) {
                    this.assignGrammarToSlot(this.selectedSlotIndex, topic);
                    return;
                }
                this.selectedGrammar = this.selectedGrammar === topic ? null : topic;
                this.saveMenuState();
                this.renderSlots();
                this.renderGrammarPicker();
            });
            this.grammarPicker.appendChild(button);
        }
    },

    assignGrammarToSlot(slotIndex, grammarTopic) {
        this.slotAssignments[slotIndex] = grammarTopic;
        this.selectedGrammar = null;
        this.selectedSlotIndex = null;
        this.saveMenuState();
        this.renderSlots();
        this.renderGrammarPicker();
        this.updateStartButton();
    },

    isMenuComplete() {
        return Boolean(this.selectedLevel && this.selectedLexical && this.slotAssignments.every(Boolean));
    },

    updateStartButton() {
        this.startButton.disabled = !this.ready || !this.isMenuComplete();
    },

    showIntro() {
        this.intro.style.display = 'flex';
    },

    hideIntro() {
        this.intro.style.display = 'none';
    },

    hideOverlay() {
        this.overlay.style.display = 'none';
    },

    showOutcome(state, targetGame) {
        const titles = {
            won: ['ПУТЬ НАЙДЕН', '#ffd37a', 'Финальная дверь приняла риск.'],
            wrong_door: ['СУД ДВЕРЕЙ', '#ff5555', 'В пятом режиме неверная дверь завершает забег.'],
            burned: ['СГОРЕЛИ', '#ff7733', 'Ритм головы оказался быстрее решения.']
        };
        const [title, color, subtitle] = titles[state] || ['-', '#ffffff', ''];
        const data = targetGame.getHudData();
        this.overlay.innerHTML =
            `<div class="outcome" style="color:${color}">${title}</div>` +
            `<div class="outcome-sub">${subtitle}</div>` +
            `<div class="hint">Ответы: <b>${data.questionsCorrect}/${data.questionsAnswered}</b>. Нажмите <b>R</b> или <b>Enter</b>, чтобы повторить текущий режим.</div>`;
        this.overlay.style.display = 'flex';
    },

    showMessage(text, duration = 1800) {
        window.clearTimeout(this.messageTimer);
        this.message.textContent = text;
        this.message.classList.remove('hidden');
        this.messageTimer = window.setTimeout(() => {
            this.message.classList.add('hidden');
        }, duration);
    },

    update(targetGame) {
        if (!targetGame || !targetGame.player) return;
        const data = targetGame.getHudData();
        const tileLabel = data.tile === 0 ? 'периметр' :
            data.tile === data.tiles - 1 ? 'дверь' :
            `клетка ${data.tile}`;
        const prepared = data.inQuestion ? 'Enter фиксирует ответ' :
            data.readyMoves ? `готовых ходов: ${data.readyMoves}` : 'выберите направление';
        const bank = data.bankedCount ? `банк: ${data.bankedCount}/${data.bankLimit}` : 'банк пуст';
        const altar = data.altarReady ? '<span class="hud-alert">алтарь рядом</span>' : '';
        const final = data.finalTrial ? '<span class="hud-danger">неверная дверь смертельна</span>' : '';
        const heat = data.heatActive ? '<span class="hud-danger">жар ускорен</span>' : '';
        const wave = data.fireWaveActive ? '<span class="hud-danger">волна огня</span>' : '';

        this.hud.innerHTML =
            `<div class="hud-row"><b>Режим ${data.level}</b> ${data.modeName} <span>${data.modeShort}</span></div>` +
            `<div class="hud-row">Мост <b>${data.bridge}/${data.bridges}</b> - ${tileLabel} - ${prepared}</div>` +
            `<div class="hud-row dim">Помечено ложных дверей: <b>${data.revealedFalse}/6</b> - ${bank}</div>` +
            `<div class="hud-row dim">${altar} ${final} ${heat} ${wave}</div>`;
    },

    showQuestion(current) {
        const question = current.question;
        const targetLabel = current.context === 'altar'
            ? `Алтарь: вопрос ${current.altarIndex}/2`
            : current.hiddenResult
                ? `Банк хода: мост ${current.targetBridge + 1}, клетка ${current.targetTile}`
                : `Свободный ход: мост ${current.targetBridge + 1}`;

        this.questionMode.textContent = targetLabel;
        this.questionTopic.textContent = `${question.topic} - ${question.level} - ${question.lexicalTopic}`;
        this.questionText.textContent = `${question.text} ${question.display}`;
        this.questionFeedback.textContent = current.hiddenResult
            ? 'Результат скрыт. Удерживайте мышь для замедления, Enter фиксирует вариант под маркером.'
            : 'Удерживайте мышь для замедления. Enter фиксирует ответ; правильный ответ заряжает свободный ход.';

        this.questionOptions.innerHTML = '';
        this.optionNodes = question.options.map((option, index) => {
            const button = document.createElement('button');
            button.className = 'option-btn';
            button.type = 'button';

            const heat = document.createElement('span');
            heat.className = 'option-heat';

            const label = document.createElement('span');
            label.className = 'option-label';
            label.textContent = `${index + 1}. ${option}`;

            button.append(heat, label);
            this.questionOptions.appendChild(button);
            return { button, heat };
        });

        this.questionPanel.classList.remove('hidden', 'slowed');
        this.updateQuestionMarker(0, 0, false);
    },

    hideQuestion() {
        this.questionPanel.classList.add('hidden');
        this.questionPanel.classList.remove('slowed');
        this.optionNodes = [];
    },

    setQuestionSlow(on) {
        this.questionPanel.classList.toggle('slowed', on);
    },

    updateQuestionMarker(index, progress, slowed) {
        this.questionPanel.classList.toggle('slowed', slowed);
        this.optionNodes.forEach((node, itemIndex) => {
            const active = itemIndex === index;
            node.button.classList.toggle('armed', active);
            node.heat.style.transform = active ? `scaleX(${0.2 + progress * 0.8})` : 'scaleX(0)';
        });
    },

    showPeek(rows) {
        this.peekRows.innerHTML = '';
        for (const row of rows) {
            const item = document.createElement('div');
            item.className = 'peek-row';
            item.textContent = `${row.label}: ${row.state} ${row.seconds.toFixed(1)} c`;
            this.peekRows.appendChild(item);
        }
        this.peekPanel.classList.remove('hidden');
    },

    hidePeek() {
        this.peekPanel.classList.add('hidden');
    }
};

const gameInstance = new Game(scene, camera, renderer, ui);
ui.bind(gameInstance);

let stats = { frames: 0, t0: performance.now() };
function tickFps() {
    stats.frames++;
    const now = performance.now();
    if (now - stats.t0 > 1000) {
        const fps = (stats.frames * 1000 / (now - stats.t0)).toFixed(0);
        ui.fps.textContent = `${fps} fps`;
        stats.frames = 0;
        stats.t0 = now;
    }
}

function animate() {
    requestAnimationFrame(animate);
    if (document.hidden) return;
    gameInstance.update();
    gameInstance.render();
    tickFps();
}

(async () => {
    try {
        ui.setReady(false);
        await gameInstance.build();
        ui.setReady(true);
        animate();
    } catch (e) {
        console.error(e);
        document.querySelector('#intro').innerHTML =
            `<div class="outcome" style="color:#ff5555">Failed to load</div>` +
            `<div class="hint">${e.message}</div>`;
    }
})();
