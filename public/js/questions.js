export const LANGUAGE_LEVELS = ['A1', 'A2', 'B1', 'B2'];

export const LEXICAL_TOPICS = [
    'Reisen und Stadt',
    'Schule und Beruf',
    'Essen und Alltag',
    'Familie und Wohnen',
    'Natur und Wetter',
    'Medien und Technik'
];

export const GRAMMAR_TOPICS = [
    'Präsens',
    'Perfekt',
    'Präteritum',
    'Futur I',
    'Imperativ',
    'Modalverben',
    'Trennbare Verben',
    'Reflexive Verben',
    'Verben mit Präpositionen',
    'Lassen',
    'Artikel',
    'Nominativ',
    'Akkusativ',
    'Dativ',
    'Genitiv',
    'N-Deklination',
    'Pronomen',
    'Possessivpronomen',
    'Adjektivdeklination',
    'Steigerung',
    'Wechselpräpositionen',
    'Lokale Präpositionen',
    'Temporale Präpositionen',
    'Negation',
    'Satzklammer',
    'Wortstellung im Hauptsatz',
    'Wortstellung im Nebensatz',
    'weil-Sätze',
    'dass-Sätze',
    'wenn-Sätze',
    'Relativsätze',
    'Indirekte Fragen',
    'Infinitiv mit zu',
    'Konjunktiv II',
    'Passiv',
    'Plusquamperfekt',
    'Doppelkonjunktionen',
    'als vs. wenn'
];

const LEVEL_RANK = { A1: 1, A2: 2, B1: 3, B2: 4 };

const QUESTION_POOL = [
    {
        level: 'A1',
        topic: 'Artikel',
        text: 'Выбери правильный артикль.',
        display: '___ Zug kommt um acht Uhr.',
        options: ['Der', 'Die', 'Das', 'Den'],
        correct: 0
    },
    {
        level: 'A1',
        topic: 'Praesens',
        text: 'Выбери правильную форму глагола.',
        display: 'Maria ___ jeden Morgen Kaffee.',
        options: ['trinkt', 'trinken', 'trinke', 'trinkst'],
        correct: 0
    },
    {
        level: 'A1',
        topic: 'Akkusativ',
        text: 'Выбери форму в Akkusativ.',
        display: 'Ich sehe ___ Hund im Park.',
        options: ['den', 'der', 'dem', 'das'],
        correct: 0
    },
    {
        level: 'A1',
        topic: 'Wortstellung',
        text: 'Выбери правильный порядок слов.',
        display: 'morgen / ich / fahre / nach Berlin',
        options: [
            'Morgen fahre ich nach Berlin.',
            'Morgen ich fahre nach Berlin.',
            'Ich nach Berlin fahre morgen.',
            'Fahre ich morgen nach Berlin.'
        ],
        correct: 0
    },
    {
        level: 'A1',
        topic: 'Negation',
        text: 'Выбери правильное отрицание.',
        display: 'Wir haben ___ Zeit.',
        options: ['keine', 'nicht', 'kein', 'keinen'],
        correct: 0
    },
    {
        level: 'A2',
        topic: 'Perfekt',
        text: 'Выбери правильную форму Perfekt.',
        display: 'Gestern ___ wir ins Museum gegangen.',
        options: ['sind', 'haben', 'sein', 'hat'],
        correct: 0
    },
    {
        level: 'A2',
        topic: 'Dativ',
        text: 'Выбери форму в Dativ.',
        display: 'Ich helfe ___ neuen Nachbarin.',
        options: ['der', 'die', 'den', 'dem'],
        correct: 0
    },
    {
        level: 'A2',
        topic: 'Modalverben',
        text: 'Выбери правильную конструкцию.',
        display: 'Am Abend ___ Lukas noch lernen.',
        options: ['muss', 'musst', 'mussen', 'muesst'],
        correct: 0
    },
    {
        level: 'A2',
        topic: 'Wechselpraepositionen',
        text: 'Выбери правильный падеж.',
        display: 'Das Buch liegt auf ___ Tisch.',
        options: ['dem', 'den', 'der', 'das'],
        correct: 0
    },
    {
        level: 'A2',
        topic: 'Trennbare Verben',
        text: 'Выбери правильный вариант.',
        display: 'Der Zug ___ um 9 Uhr ___.',
        options: ['kommt ... an', 'ankommt ...', 'kommt ... auf', 'kommt ... mit'],
        correct: 0
    },
    {
        level: 'A2',
        topic: 'Nebensatz',
        text: 'Выбери правильный порядок слов.',
        display: 'Ich bleibe zu Hause, weil ...',
        options: [
            'ich krank bin.',
            'ich bin krank.',
            'bin ich krank.',
            'krank ich bin.'
        ],
        correct: 0
    },
    {
        level: 'A2',
        topic: 'Adjektivdeklination',
        text: 'Выбери правильное окончание.',
        display: 'Das ist ein ___ Platz.',
        options: ['ruhiger', 'ruhige', 'ruhigen', 'ruhiges'],
        correct: 0
    },
    {
        level: 'B1',
        topic: 'Konjunktiv II',
        text: 'Выбери вежливую форму.',
        display: '___ Sie mir bitte helfen?',
        options: ['Koennten', 'Koennen', 'Konnten', 'Kann'],
        correct: 0
    },
    {
        level: 'B1',
        topic: 'Infinitiv mit zu',
        text: 'Выбери правильную конструкцию.',
        display: 'Anna versucht, den Text ___ verstehen.',
        options: ['zu', 'zum', 'um zu', ''],
        correct: 0
    },
    {
        level: 'B1',
        topic: 'Passiv',
        text: 'Выбери правильную форму Passiv.',
        display: 'Die Tuer ___ jeden Abend geschlossen.',
        options: ['wird', 'ist', 'hat', 'werden'],
        correct: 0
    },
    {
        level: 'B1',
        topic: 'Relativsatz',
        text: 'Выбери правильное относительное местоимение.',
        display: 'Das ist der Mann, ___ ich gestern geholfen habe.',
        options: ['dem', 'den', 'der', 'dessen'],
        correct: 0
    },
    {
        level: 'B1',
        topic: 'Praeteritum',
        text: 'Выбери правильную форму Praeteritum.',
        display: 'Als Kind ___ sie oft am Meer.',
        options: ['war', 'ist', 'sein', 'waere'],
        correct: 0
    },
    {
        level: 'B1',
        topic: 'Doppelkonjunktionen',
        text: 'Выбери правильную пару.',
        display: '___ der Film war spannend, ___ die Musik war gut.',
        options: ['Nicht nur ... sondern auch', 'Entweder ... aber', 'Sowohl ... oder', 'Je ... sondern'],
        correct: 0
    },
    {
        level: 'B2',
        topic: 'Genitiv',
        text: 'Выбери форму Genitiv.',
        display: 'Waehrend ___ Treffens blieb das Handy aus.',
        options: ['des', 'dem', 'den', 'der'],
        correct: 0
    },
    {
        level: 'B2',
        topic: 'Plusquamperfekt',
        text: 'Выбери правильную форму.',
        display: 'Nachdem er gegessen ___, ging er los.',
        options: ['hatte', 'hat', 'war', 'wurde'],
        correct: 0
    },
    {
        level: 'B2',
        topic: 'Indirekte Frage',
        text: 'Выбери правильный порядок слов.',
        display: 'Kannst du mir sagen, ...',
        options: [
            'wann der Kurs beginnt?',
            'wann beginnt der Kurs?',
            'wann der Kurs beginnt.',
            'wann beginnt Kurs der?'
        ],
        correct: 0
    },
    {
        level: 'B2',
        topic: 'Konnektoren',
        text: 'Выбери подходящий союз.',
        display: '___ es stark regnet, gehen wir spazieren.',
        options: ['Obwohl', 'Weil', 'Damit', 'Sobald'],
        correct: 0
    },
    {
        level: 'B2',
        topic: 'Nominalisierung',
        text: 'Выбери правильный вариант.',
        display: 'Nach ___ der Aufgabe durfte die Gruppe gehen.',
        options: ['der Loesung', 'die Loesung', 'dem Loesen', 'das Loesen'],
        correct: 0
    },
    {
        level: 'B2',
        topic: 'Wortstellung',
        text: 'Выбери грамматически правильное предложение.',
        display: 'trotzdem / kommt / er / puenktlich',
        options: [
            'Trotzdem kommt er puenktlich.',
            'Trotzdem er kommt puenktlich.',
            'Er puenktlich kommt trotzdem.',
            'Kommt trotzdem er puenktlich.'
        ],
        correct: 0
    }
];

function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

export class QuestionBank {
    constructor() {
        this.level = 'A2';
        this.lexicalTopic = LEXICAL_TOPICS[0];
        this.fallbackCursor = 0;
        this.grammarCursor = 0;
        this.selectedSlots = [];
        this.fallbackPool = shuffle(QUESTION_POOL);
        this.questionPool = Object.create(null);
        this.fetching = Object.create(null);
        this.usedDisplays = Object.create(null);
    }

    configure(settings = {}) {
        this.level = settings.langLevel || this.level;
        this.lexicalTopic = settings.lexicalTopic || this.lexicalTopic;
        this.fallbackCursor = 0;
        this.grammarCursor = 0;
        this.selectedSlots = (settings.grammarSlots || [])
            .filter((slot) => slot && slot.grammarTopic)
            .map((slot) => ({
                grammarTopic: slot.grammarTopic,
                isWortstellung: Boolean(slot.isWortstellung)
            }));
        this.fallbackPool = shuffle(QUESTION_POOL);
        this.questionPool = Object.create(null);
        this.fetching = Object.create(null);
        this.usedDisplays = Object.create(null);
        this.prefetchAll();
    }

    prefetchAll() {
        const slots = this._slotCycle().slice(0, 5);
        for (const slot of slots) {
            this._ensurePool(slot);
        }
    }

    async nextQuestion() {
        const slot = this._nextGrammarSlot();
        try {
            const question = await this._getGeneratedQuestion(slot);
            if (question) return question;
        } catch (error) {
            console.warn('AI question generation fallback:', error);
        }

        return this._fallbackQuestion(slot);
    }

    async _getGeneratedQuestion(slot) {
        const key = this._slotKey(slot);
        const pool = await this._ensurePool(slot);
        if (!pool || pool.length === 0) return null;

        const raw = pool.shift();
        if (pool.length <= 2) {
            this._ensurePool(slot);
        }

        const formatted = this._formatQuestion(raw, slot);
        const used = this.usedDisplays[key] || new Set();
        used.add(raw.display);
        this.usedDisplays[key] = used;
        return formatted;
    }

    async _ensurePool(slot) {
        const key = this._slotKey(slot);
        if (this.fetching[key]) {
            return this.fetching[key];
        }

        const pool = this.questionPool[key];
        if (pool && pool.length > 0) {
            return pool;
        }

        this.fetching[key] = this._fetchQuestions(slot)
            .catch((error) => {
                console.warn(`Не удалось загрузить вопросы для темы ${slot.grammarTopic}:`, error);
                return [];
            })
            .then((result) => {
                delete this.fetching[key];
                return result;
            }, (error) => {
                delete this.fetching[key];
                throw error;
            });

        return this.fetching[key];
    }

    async _fetchQuestions(slot) {
        const key = this._slotKey(slot);
        const seen = Array.from(this.usedDisplays[key] || []).slice(-12);
        const response = await fetch('/api/generate-questions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                level: this.level,
                lexicalTopic: this.lexicalTopic,
                grammarTopic: slot.grammarTopic,
                isWortstellung: slot.isWortstellung,
                count: 10,
                exclude: seen
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const valid = (data.questions || []).filter((question) => this._isValidQuestion(question));
        if (!valid.length) return [];

        const pool = [...(this.questionPool[key] || []), ...shuffle(valid)];
        this.questionPool[key] = pool;
        return pool;
    }

    _formatQuestion(rawQuestion, slot) {
        const correctAnswer = rawQuestion.options[rawQuestion.correct];
        const options = shuffle(rawQuestion.options);

        return {
            level: this.level,
            topic: slot.isWortstellung ? `Wortstellung + ${slot.grammarTopic}` : slot.grammarTopic,
            text: rawQuestion.text,
            display: rawQuestion.display,
            lexicalTopic: this.lexicalTopic,
            options,
            correctIndex: options.indexOf(correctAnswer),
            generated: true
        };
    }

    _fallbackQuestion(slot) {
        const maxRank = LEVEL_RANK[this.level] || LEVEL_RANK.A2;
        const candidates = this.fallbackPool.filter((question) => LEVEL_RANK[question.level] <= maxRank);
        const source = candidates.length ? candidates : this.fallbackPool;
        const raw = source[this.fallbackCursor % source.length];
        this.fallbackCursor += 1;

        const correctAnswer = raw.options[raw.correct];
        const options = shuffle(raw.options);
        return {
            level: raw.level,
            topic: slot ? (slot.isWortstellung ? `Wortstellung + ${slot.grammarTopic}` : slot.grammarTopic) : raw.topic,
            text: raw.text,
            display: raw.display,
            lexicalTopic: this.lexicalTopic,
            options,
            correctIndex: options.indexOf(correctAnswer),
            generated: false
        };
    }

    _nextGrammarSlot() {
        const slots = this._slotCycle();
        const slot = slots[this.grammarCursor % slots.length];
        this.grammarCursor += 1;
        return slot;
    }

    _slotCycle() {
        if (this.selectedSlots.length > 0) {
            return this.selectedSlots;
        }

        const maxRank = LEVEL_RANK[this.level] || LEVEL_RANK.A2;
        if (maxRank <= LEVEL_RANK.A1) {
            return ['Präsens', 'Artikel', 'Nominativ', 'Akkusativ', 'Wortstellung im Hauptsatz', 'Negation'].map((grammarTopic) => ({
                grammarTopic,
                isWortstellung: grammarTopic.includes('Wortstellung')
            }));
        }
        if (maxRank <= LEVEL_RANK.A2) {
            return ['Perfekt', 'Dativ', 'Modalverben', 'Wechselpräpositionen', 'Trennbare Verben', 'weil-Sätze', 'Adjektivdeklination'].map((grammarTopic) => ({
                grammarTopic,
                isWortstellung: grammarTopic.includes('Wortstellung')
            }));
        }
        if (maxRank <= LEVEL_RANK.B1) {
            return ['Konjunktiv II', 'Infinitiv mit zu', 'Passiv', 'Relativsätze', 'Präteritum', 'Doppelkonjunktionen'].map((grammarTopic) => ({
                grammarTopic,
                isWortstellung: grammarTopic.includes('Wortstellung')
            }));
        }
        return ['Genitiv', 'Plusquamperfekt', 'Indirekte Fragen', 'Passiv', 'Konjunktiv II', 'Wortstellung im Nebensatz'].map((grammarTopic) => ({
            grammarTopic,
            isWortstellung: grammarTopic.includes('Wortstellung')
        }));
    }

    _slotKey(slot) {
        return `${slot.grammarTopic}:${slot.isWortstellung ? 'w' : 'g'}`;
    }

    _isValidQuestion(question) {
        return Boolean(
            question &&
            typeof question.text === 'string' &&
            typeof question.display === 'string' &&
            Array.isArray(question.options) &&
            question.options.length === 4 &&
            typeof question.correct === 'number' &&
            question.correct >= 0 &&
            question.correct <= 3
        );
    }
}
