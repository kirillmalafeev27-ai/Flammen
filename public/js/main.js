import * as THREE from 'three';
import { Game } from './game.js';
import { LANGUAGE_LEVELS, LEXICAL_TOPICS, GRAMMAR_TOPICS } from './questions.js';

const RITUAL_SLOTS = [
    { id: 'wortstellung', title: 'Порядок', role: 'Wortstellung', isWortstellung: true },
    { id: 'step', title: 'Ход', role: 'Грамматика', isWortstellung: false },
    { id: 'memory', title: 'Память', role: 'Банк', isWortstellung: false },
    { id: 'door', title: 'Двери', role: 'Расследование', isWortstellung: false },
    { id: 'altar', title: 'Алтарь', role: 'Риск', isWortstellung: false }
];

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

        try {
            const savedName = localStorage.getItem('flammen_player_name');
            if (savedName) this.playerName.value = savedName;
        } catch (error) {
            // Local storage is optional.
        }

        this.playerName.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                this.showStep(2);
            }
        });
    },

    populateMenu() {
        this.renderLevelButtons();
        this.renderLexicalGrid();
        this.renderSlots();
        this.renderGrammarPicker();
        this.showStep(1);
        this.updateStartButton();
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
        return {
            playerName,
            langLevel: this.selectedLevel || 'A2',
            lexicalTopic: this.selectedLexical || LEXICAL_TOPICS[0],
            grammarSlots: this.slotAssignments.map((grammarTopic, index) => ({
                grammarTopic,
                isWortstellung: RITUAL_SLOTS[index].isWortstellung
            }))
        };
    },

    requestStart() {
        if (!this.ready || !this.isMenuComplete()) {
            this.startStatus.textContent = this.ready ? 'Заполните все печати перед стартом.' : 'Загрузка храма...';
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
                `<div class="slot-grammar">${grammar ? (slot.isWortstellung ? 'Wortstellung + тема' : 'активная тема') : 'выберите грамматику'}</div>`;
            button.addEventListener('click', () => {
                if (this.selectedGrammar) {
                    this.assignGrammarToSlot(index, this.selectedGrammar);
                    return;
                }
                this.selectedSlotIndex = this.selectedSlotIndex === index ? null : index;
                this.renderSlots();
                this.renderGrammarPicker();
            });
            this.ritualSlots.appendChild(button);
        });
    },

    renderGrammarPicker() {
        this.grammarPicker.innerHTML = '';
        const used = this.slotAssignments.filter(Boolean);
        for (const topic of GRAMMAR_TOPICS) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'grammar-tag';
            button.textContent = topic;
            button.classList.toggle('used', used.includes(topic));
            button.classList.toggle('selected-grammar', this.selectedGrammar === topic);
            button.addEventListener('click', () => {
                if (used.includes(topic)) return;
                if (this.selectedSlotIndex !== null) {
                    this.assignGrammarToSlot(this.selectedSlotIndex, topic);
                    return;
                }
                this.selectedGrammar = this.selectedGrammar === topic ? null : topic;
                this.renderSlots();
                this.renderGrammarPicker();
            });
            this.grammarPicker.appendChild(button);
        }
    },

    assignGrammarToSlot(slotIndex, grammarTopic) {
        for (let index = 0; index < this.slotAssignments.length; index++) {
            if (this.slotAssignments[index] === grammarTopic) {
                this.slotAssignments[index] = null;
            }
        }
        this.slotAssignments[slotIndex] = grammarTopic;
        this.selectedGrammar = null;
        this.selectedSlotIndex = null;
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
            `<div class="hint">Ответы: <b>${data.questionsCorrect}/${data.questionsAnswered}</b>. Нажмите <b>R</b> или <b>Enter</b>, чтобы начать заново.</div>`;
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
        const prepared = data.inQuestion ? 'Enter подтверждает ход' : 'выберите направление';
        const bank = data.bankedCount ? `банк: ${data.bankedCount}` : 'банк пуст';
        const altar = data.altarReady ? '<span class="hud-alert">алтарь рядом</span>' : '';
        const final = data.finalTrial ? '<span class="hud-danger">неверная дверь смертельна</span>' : '';
        const closed = data.closed.length ? `закрыты мосты: ${data.closed.join(', ')}` : 'мосты открыты';

        this.hud.innerHTML =
            `<div class="hud-row"><b>Режим ${data.level}</b> ${data.modeName} <span>${data.modeShort}</span></div>` +
            `<div class="hud-row">Мост <b>${data.bridge}/${data.bridges}</b> - ${tileLabel} - ${prepared}</div>` +
            `<div class="hud-row dim">Ложные двери: <b>${data.revealedFalse}/6</b> - группа: <b>${data.groupHintCount}</b> - ${bank}</div>` +
            `<div class="hud-row dim">${closed} ${altar} ${final}</div>`;
    },

    showQuestion(current) {
        const question = current.question;
        const targetLabel = current.context === 'altar'
            ? `Алтарь: вопрос ${current.altarIndex}/2`
            : current.hiddenResult
                ? `Банк хода: мост ${current.targetBridge + 1}, клетка ${current.targetTile}`
                : `Ход: мост ${current.targetBridge + 1}, клетка ${current.targetTile}`;

        this.questionMode.textContent = targetLabel;
        this.questionTopic.textContent = `${question.topic} - ${question.level} - ${question.lexicalTopic}`;
        this.questionText.textContent = `${question.text} ${question.display}`;
        this.questionFeedback.textContent = current.hiddenResult
            ? 'Результат скрыт. Удерживайте мышь для замедления, Enter фиксирует вариант под маркером.'
            : 'Удерживайте мышь для замедления, Enter делает ход только если маркер на правильном варианте.';

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
