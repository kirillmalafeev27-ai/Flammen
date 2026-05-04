import * as THREE from 'three';
import * as Photons from '../lib/photons.module.js';
import { GLTFLoader } from './GltfLoader.js';
import { buildFlamethrower } from './flamethrower.js';
import { QuestionBank } from './questions.js';

const params = new URLSearchParams(location.search);
const cfg = {
    bridges: parseInt(params.get('bridges') || '8'),
    tiles: parseInt(params.get('tiles') || '6'),
    rInner: parseFloat(params.get('rInner') || 'NaN'),
    rOuter: parseFloat(params.get('rOuter') || 'NaN'),
    bridgePhase: parseFloat(params.get('phase') || '0'),
    bridgeY: parseFloat(params.get('y') || 'NaN'),
    moaiHeight: parseFloat(params.get('moaiH') || '1.6'),
    fireScale: parseFloat(params.get('fireScale') || '0.18'),
    releaseMul: parseFloat(params.get('release') || '20'),
    sideOffset: parseFloat(params.get('side') || '1.0'),
    fireMouthY: parseFloat(params.get('mouthY') || '1.1'),
    debug: params.has('debug')
};

const TURN_DURATION = 0.2;
const BASE_FIRE_PERIOD = 14.0;
const BASE_FIRE_WARNING = 7.2;
const BASE_FIRE_DURATION = 1.8;
const BASE_FIRE_DECAY = 1.0;
const CAMERA_EYE_HEIGHT = 1.35;
const LOOK_SENSITIVITY = 0.0022;
const MAX_CAMERA_PITCH = Math.PI * 0.42;
const MOVE_DOT_THRESHOLD = 0.35;
const START_GRACE = 1.0;
const ANSWER_MARKER_SPEED = 0.86;
const ANSWER_MARKER_SLOW = 0.46;
const FAST_ANSWER_SECONDS = 4.2;
const TIMER_PEEK_SECONDS = 2.6;
const PEEK_HEAT_ACCEL = 0.45;
const FLAME_ACTIVE_RADIUS_SQ = 144;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const MOAI_FACE_YAW = Math.PI;
const GATE_BRIDGE_TIMINGS = [
    { period: 1.00, warning: -0.4, duration: 1.00, phase: 0.0, heatSpeed: 1.00 },
    { period: 1.06, warning: 0.2, duration: 0.92, phase: 1.4, heatSpeed: 0.98 },
    { period: 0.94, warning: -0.8, duration: 1.08, phase: 2.7, heatSpeed: 1.04 },
    { period: 1.10, warning: 0.5, duration: 0.86, phase: 3.6, heatSpeed: 0.96 },
    { period: 0.98, warning: -0.1, duration: 1.16, phase: 4.5, heatSpeed: 1.02 },
    { period: 1.13, warning: 0.8, duration: 0.94, phase: 5.1, heatSpeed: 0.95 },
    { period: 0.90, warning: -0.7, duration: 1.04, phase: 5.9, heatSpeed: 1.06 },
    { period: 1.04, warning: 0.4, duration: 1.10, phase: 6.8, heatSpeed: 0.99 }
];
const GATE_FIRE_TARGETS = [8.4, 2.2, 10.6, 4.4, 12.0, 6.4];

const STATE = {
    INTRO: 'intro',
    PLAYING: 'playing',
    BURNED: 'burned',
    WRONG_DOOR: 'wrong_door',
    WON: 'won'
};

const LEVELS = {
    1: {
        name: 'Бегающие огни',
        short: 'ритм',
        period: BASE_FIRE_PERIOD,
        warning: BASE_FIRE_WARNING,
        duration: BASE_FIRE_DURATION,
        decay: BASE_FIRE_DECAY,
        postFireBreak: BASE_FIRE_DECAY,
        heatSpeed: 1.0,
        runningWave: true,
        bank: false,
        falseHeats: false,
        fastAlternate: false,
        finalDoorTrial: false
    },
    2: {
        name: 'Шлюз',
        short: 'ожидание',
        period: 13.0,
        warning: 6.2,
        duration: 2.2,
        decay: BASE_FIRE_DECAY,
        heatSpeed: 1.0,
        gateOffset: true,
        bridgeUniqueTiming: true,
        bank: false,
        falseHeats: false,
        fastAlternate: false,
        finalDoorTrial: false
    },
    3: {
        name: 'Ложные нагревы',
        short: 'чтение',
        period: 12.5,
        warning: 5.8,
        duration: 2.0,
        decay: BASE_FIRE_DECAY,
        heatSpeed: 1.0,
        falseCycleModulo: 4,
        bank: false,
        falseHeats: true,
        fastAlternate: false,
        finalDoorTrial: false
    },
    4: {
        name: 'Банк вопросов',
        short: 'заготовка',
        period: 11.5,
        warning: 5.1,
        duration: 1.8,
        decay: BASE_FIRE_DECAY,
        heatSpeed: 1.02,
        bank: true,
        bankLimit: 2,
        falseHeats: false,
        fastAlternate: true,
        finalDoorTrial: false
    },
    5: {
        name: 'Суд дверей',
        short: 'риск',
        period: 11.0,
        warning: 4.8,
        duration: 2.0,
        decay: BASE_FIRE_DECAY,
        heatSpeed: 1.04,
        falseCycleModulo: 5,
        bank: false,
        falseHeats: true,
        fastAlternate: true,
        finalDoorTrial: true
    }
};

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function positiveModulo(value, period) {
    return ((value % period) + period) % period;
}

function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function moveKey(bridgeIndex, tileIndex) {
    return `${bridgeIndex}:${tileIndex}`;
}

export class Game {
    constructor(scene, camera, renderer, ui) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.ui = ui;
        this.clock = new THREE.Clock();
        this.elapsed = 0;
        this.manager = new Photons.Manager();
        this.questionBank = new QuestionBank();

        this.state = STATE.INTRO;
        this.currentLevel = 1;
        this.settings = {};
        this.bridges = [];
        this.statues = [];
        this.doors = [];
        this.correctDoors = new Set();
        this.revealedFalseDoors = new Set();
        this.groupHintDoors = new Set();
        this.groupHintUntil = 0;

        this.player = null;
        this.playerBridge = 0;
        this.playerTile = 0;
        this.moveAnim = null;
        this.movesMade = 0;
        this.readyMoves = 0;

        this.keys = {};
        this.cameraYaw = 0;
        this.cameraPitch = 0;
        this.lookDragging = false;
        this.startGraceUntil = 0;

        this.currentQuestion = null;
        this.questionLoading = false;
        this.questionRequestToken = null;
        this.bankedMoves = new Map();
        this.answerSlowHeld = false;
        this.answerMarkerPosition = 0;
        this.answerMarkerIndex = 0;
        this.correctAnswerStreak = 0;
        this.questionsAnswered = 0;
        this.questionsCorrect = 0;
        this.wrongDoorAttempts = 0;

        this.fireWaveUntil = 0;
        this.globalHeatUntil = 0;
        this.peekUntil = 0;
        this.peekHeatUntil = 0;
        this.peekHeatStatue = null;

        this.bonusAltar = null;
        this.altarAnswers = [];

        this.audioContext = null;

        this._cameraPos = new THREE.Vector3();
        this._cameraTarget = new THREE.Vector3();
        this._cameraForward = new THREE.Vector3();
        this._cameraRight = new THREE.Vector3();
        this._moveDesired = new THREE.Vector3();
        this._moveCandidate = new THREE.Vector3();
        this._timerRows = [
            { label: '', state: '', seconds: 0 },
            { label: '', state: '', seconds: 0 },
            { label: '', state: '', seconds: 0 }
        ];
        this._cycle = {
            period: 0, warning: 0, duration: 0, decay: 0, heatSpeed: 0,
            phaseSeed: 0, phase: 0, fireEnd: 0, decayEnd: 0,
            cycleIndex: 0, falseCycle: false
        };
    }

    async build() {
        await this.loadAssets();
        this.layoutWorld();
        this.spawnPlayer();
        this.placeStatuesAndDoors();
        this.randomizeCorrectDoors();
        this.bindInput();
        this.ui.showIntro();
    }

    async loadAssets() {
        const MeshoptDecoder = await this.loadMeshoptDecoder();
        const loader = new GLTFLoader();
        loader.setMeshoptDecoder(MeshoptDecoder);
        const [temple, moai] = await Promise.all([
            loader.loadAsync('assets/temple.glb'),
            loader.loadAsync('assets/moai.glb')
        ]);

        this.templeRoot = temple.scene;
        this.scene.add(this.templeRoot);
        this.templeRoot.traverse(o => {
            if (o.isMesh) {
                o.castShadow = false;
                o.receiveShadow = true;
                if (o.material && o.material.map) {
                    o.material.map.anisotropy = 4;
                }
            }
        });

        this.moaiTemplate = moai.scene;
        const moaiBox = new THREE.Box3().setFromObject(this.moaiTemplate);
        const moaiHeight = moaiBox.max.y - moaiBox.min.y;
        this.moaiTemplateScale = cfg.moaiHeight / Math.max(0.001, moaiHeight);
        this.moaiTemplateMinY = moaiBox.min.y;
    }

    async loadMeshoptDecoder() {
        try {
            const module = await import('../lib/meshopt_decoder.module.js');
            return module.MeshoptDecoder;
        } catch (error) {
            throw new Error('Missing meshopt decoder: public/lib/meshopt_decoder.module.js');
        }
    }

    layoutWorld() {
        const box = new THREE.Box3().setFromObject(this.templeRoot);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);

        const radiusXZ = 0.5 * Math.max(size.x, size.z);
        if (!isFinite(cfg.rOuter)) cfg.rOuter = radiusXZ * 0.86;
        if (!isFinite(cfg.rInner)) cfg.rInner = radiusXZ * 0.30;
        if (!isFinite(cfg.bridgeY)) cfg.bridgeY = box.min.y + size.y * 0.1;

        this.center = new THREE.Vector3(center.x, cfg.bridgeY, center.z);

        for (let i = 0; i < cfg.bridges; i++) {
            const angle = cfg.bridgePhase + (i / cfg.bridges) * Math.PI * 2;
            const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
            const tilePositions = [];
            for (let t = 0; t < cfg.tiles; t++) {
                const r = cfg.rOuter - (t / (cfg.tiles - 1)) * (cfg.rOuter - cfg.rInner);
                tilePositions.push(this.center.clone().add(dir.clone().multiplyScalar(r)));
            }
            this.bridges.push({ index: i, angle, dir, tiles: tilePositions });
        }

        if (cfg.debug) this.drawDebug();
    }

    drawDebug() {
        for (const b of this.bridges) {
            for (let t = 0; t < b.tiles.length; t++) {
                const isDoor = (t === b.tiles.length - 1);
                const color = isDoor ? 0x00ff00 : 0xff3300;
                const m = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.3, 0.3, 0.05, 16),
                    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 })
                );
                m.position.copy(b.tiles[t]).y += 0.05;
                this.scene.add(m);
            }
        }
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(cfg.rOuter, 0.08, 8, 96),
            new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.5 })
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.copy(this.center).y += 0.05;
        this.scene.add(ring);
    }

    spawnPlayer() {
        const group = new THREE.Group();
        const body = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.25, 0.7, 6, 12),
            new THREE.MeshStandardMaterial({ color: 0xc8d4ff, roughness: 0.4, metalness: 0.05, emissive: 0x223366, emissiveIntensity: 0.4 })
        );
        body.position.y = 0.6;
        body.castShadow = false;
        body.visible = false;
        group.add(body);

        const halo = new THREE.Mesh(
            new THREE.RingGeometry(0.35, 0.5, 24),
            new THREE.MeshBasicMaterial({ color: 0x88ddff, side: THREE.DoubleSide, transparent: true, opacity: 0.7 })
        );
        halo.rotation.x = -Math.PI / 2;
        halo.position.y = 0.02;
        halo.visible = false;
        group.add(halo);
        this.playerHalo = halo;

        const torch = new THREE.PointLight(0x88aaff, 1.4, 6, 2.0);
        torch.position.y = 1.2;
        group.add(torch);

        this.scene.add(group);
        this.player = group;
        this.player.position.copy(this.bridges[0].tiles[0]);
    }

    placeStatuesAndDoors() {
        for (const b of this.bridges) {
            const doorTile = b.tiles.length - 1;
            const firstFireTile = 1;
            const fireTileCount = Math.max(1, doorTile - firstFireTile);
            b.fireStatues = [];
            for (let t = firstFireTile; t < doorTile; t++) {
                const fireIndex = t - firstFireTile;
                const side = (fireIndex % 2 === 0) ? -1 : +1;
                const statue = this.makeStatue(b.tiles[t], b, side);
                statue.fireTile = t;
                statue.fireIndex = fireIndex;
                statue.phaseRatio = this.getFirePhase(b.index, fireIndex, fireTileCount) / BASE_FIRE_PERIOD;
                statue.bridgeIndex = b.index;
                statue.falsePhase = (b.index * 1.37 + fireIndex * 2.11) % 7.4;
                this.statues.push(statue);
                b.fireStatues.push(statue);
            }

            const doorPos = b.tiles[b.tiles.length - 1].clone();
            const door = this.makeDoor(doorPos, b);
            this.doors.push(door);
            b.door = door;
        }

        this.placeBonusAltar();
    }

    getFirePhase(bridgeIndex, tileIndex, fireTileCount) {
        const tileStep = BASE_FIRE_PERIOD / Math.max(1, fireTileCount);
        const bridgeStep = BASE_FIRE_PERIOD / Math.max(1, cfg.bridges);
        return (tileIndex * tileStep + bridgeIndex * bridgeStep * 0.5) % BASE_FIRE_PERIOD;
    }

    makeStatue(tilePos, bridge, side) {
        const group = new THREE.Group();
        this.scene.add(group);

        const lateral = new THREE.Vector3().crossVectors(bridge.dir, new THREE.Vector3(0, 1, 0)).normalize();
        const sideVec = lateral.clone().multiplyScalar(side * cfg.sideOffset);
        const statuePos = tilePos.clone().add(sideVec);

        const facingDir = sideVec.clone().multiplyScalar(-1).normalize();
        const moai = this.makeStatueMesh(statuePos, facingDir);
        group.add(moai);

        const fireOrigin = new THREE.Object3D();
        fireOrigin.position.copy(statuePos);
        fireOrigin.position.y += cfg.fireMouthY;
        fireOrigin.position.add(facingDir.clone().multiplyScalar(0.3));
        this.scene.add(fireOrigin);

        const eyeLight = new THREE.PointLight(0xff5522, 0, 5, 2.0);
        eyeLight.position.copy(fireOrigin.position);
        eyeLight.visible = false;
        this.scene.add(eyeLight);

        const coalMat = new THREE.MeshBasicMaterial({
            color: 0xff5522,
            transparent: true,
            opacity: 0.08,
            depthWrite: false
        });
        const coal = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), coalMat);
        coal.position.copy(fireOrigin.position);
        coal.visible = false;
        this.scene.add(coal);

        return {
            group, fireOrigin, flame: null, eyeLight, coal, coalMat,
            position: statuePos, facing: facingDir, tilePosition: tilePos.clone(),
            heatOffset: 0, isFireActive: false, afterFireSafeUntil: 0, visualState: 'cold'
        };
    }

    ensureStatueFlame(statue) {
        if (statue.flame) return statue.flame;
        const flame = buildFlamethrower(statue.fireOrigin, this.renderer, {
            scale: cfg.fireScale,
            releaseMultiplier: cfg.releaseMul,
            animSpeed: 2.2,
            direction: statue.facing
        });

        this.manager.addParticleSystem(flame.systems.embers);
        this.manager.addParticleSystem(flame.systems.baseFlame);
        this.manager.addParticleSystem(flame.systems.brightFlame);
        statue.flame = flame;
        return flame;
    }

    setStatueFlame(statue, firing) {
        if (!firing && !statue.flame) return;
        const flame = firing ? this.ensureStatueFlame(statue) : statue.flame;
        if (flame && flame.isFiring() !== firing) flame.setFiring(firing);
    }

    makeStatueMesh(position, facingDir) {
        const inner = this.moaiTemplate.clone(true);
        inner.scale.setScalar(this.moaiTemplateScale);
        inner.position.y = -this.moaiTemplateMinY * this.moaiTemplateScale;

        const wrap = new THREE.Group();
        wrap.add(inner);
        wrap.position.copy(position);
        wrap.lookAt(position.clone().add(facingDir));
        wrap.rotateY(MOAI_FACE_YAW);

        wrap.traverse(o => {
            if (o.isMesh) {
                o.castShadow = false;
                o.receiveShadow = false;
            }
        });
        return wrap;
    }

    makeDoor(position, bridge) {
        const group = new THREE.Group();
        const frameMat = new THREE.MeshStandardMaterial({ color: 0x2a1f15, roughness: 0.8, metalness: 0.2 });
        const slabMat = new THREE.MeshStandardMaterial({
            color: 0x1a0d08, roughness: 0.7, metalness: 0.3,
            emissive: 0x110200, emissiveIntensity: 0.3,
            transparent: true,
            opacity: 1
        });
        const frame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 0.3), frameMat);
        frame.position.set(0, 1.2, 0);
        const slab = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.0, 0.15), slabMat);
        slab.position.set(0, 1.0, 0.1);
        group.add(frame, slab);

        const ringGeo = new THREE.TorusGeometry(0.6, 0.04, 8, 32);
        const ringMat = new THREE.MeshStandardMaterial({ color: 0xffaa44, emissive: 0x441100, emissiveIntensity: 0.5 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(0, 1.0, 0.2);
        group.add(ring);

        const symbolMat = new THREE.MeshBasicMaterial({
            color: 0xffcc66,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0
        });
        const symbol = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.27, 3), symbolMat);
        symbol.position.set(0, 0.045, -0.9);
        symbol.rotation.x = -Math.PI / 2;
        group.add(symbol);

        group.position.copy(position);
        const inward = new THREE.Vector3().subVectors(this.center, position).setY(0).normalize();
        group.lookAt(position.clone().add(inward));
        this.scene.add(group);

        return {
            group, slab, ring, symbol, position: position.clone(),
            slabBaseY: slab.position.y,
            bridgeIndex: bridge.index, ringMat, slabMat, symbolMat
        };
    }

    placeBonusAltar() {
        const bridgeIndex = Math.floor(cfg.bridges / 2);
        const bridge = this.bridges[bridgeIndex];
        const lateral = new THREE.Vector3().crossVectors(bridge.dir, WORLD_UP).normalize();
        const position = bridge.tiles[0].clone().add(lateral.multiplyScalar(1.15));

        const group = new THREE.Group();
        const base = new THREE.Mesh(
            new THREE.CylinderGeometry(0.42, 0.56, 0.18, 18),
            new THREE.MeshStandardMaterial({ color: 0x221716, roughness: 0.72, metalness: 0.12 })
        );
        base.position.y = 0.09;
        const bowl = new THREE.Mesh(
            new THREE.CylinderGeometry(0.32, 0.22, 0.18, 18),
            new THREE.MeshStandardMaterial({ color: 0x4a2212, roughness: 0.45, metalness: 0.25, emissive: 0x2a0800, emissiveIntensity: 0.5 })
        );
        bowl.position.y = 0.28;
        const gemMat = new THREE.MeshBasicMaterial({ color: 0xffa23a, transparent: true, opacity: 0.86 });
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), gemMat);
        gem.position.y = 0.58;
        const light = new THREE.PointLight(0xff7a22, 1.2, 4.5, 2.0);
        light.position.y = 0.7;
        group.add(base, bowl, gem, light);
        group.position.copy(position);
        this.scene.add(group);

        this.bonusAltar = { bridgeIndex, group, gem, gemMat, light, used: false };
    }

    randomizeCorrectDoors() {
        this.correctDoors.clear();
        const idx = Array.from({ length: cfg.bridges }, (_, i) => i);
        for (let i = idx.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [idx[i], idx[j]] = [idx[j], idx[i]];
        }
        this.correctDoors.add(idx[0]);
        this.correctDoors.add(idx[1]);
        this.refreshDoorVisuals();
    }

    bindInput() {
        const canvas = this.renderer.domElement;
        canvas.tabIndex = 0;

        window.addEventListener('keydown', (e) => {
            if (this.isGameplayKey(e.code)) e.preventDefault();
            this.keys[e.code] = true;

            if (this.state === STATE.INTRO) {
                if (e.code === 'Enter' || e.code === 'Space') {
                    this.ui.requestStart();
                }
                return;
            }

            if (this.state === STATE.WON || this.state === STATE.BURNED || this.state === STATE.WRONG_DOOR) {
                if (e.code === 'KeyR' || e.code === 'Enter' || e.code === 'Space') {
                    this.restart();
                }
                return;
            }

            if (this.state !== STATE.PLAYING) return;

            if (this.currentQuestion) {
                if (e.code === 'Enter') {
                    this.confirmAnswer();
                }
                return;
            }

            if (this.questionLoading) return;

            if (e.code === 'KeyF') {
                this.peekTimers();
                return;
            }

            if (this.moveAnim) return;

            switch (e.code) {
                case 'ArrowUp': case 'KeyW': this.tryMoveRelative(1, 0); break;
                case 'ArrowDown': case 'KeyS': this.tryMoveRelative(-1, 0); break;
                case 'ArrowLeft': case 'KeyA': this.tryMoveRelative(0, -1); break;
                case 'ArrowRight': case 'KeyD': this.tryMoveRelative(0, 1); break;
                case 'KeyE':
                case 'Space':
                    if (!this.tryEnterDoor()) this.tryActivateBonusAltar();
                    break;
            }
        });
        window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

        canvas.addEventListener('pointerdown', (e) => {
            if (this.state !== STATE.PLAYING || this.currentQuestion || this.questionLoading) return;
            this.lookDragging = true;
            canvas.focus();
            this.tryPointerLock();
            e.preventDefault();
        });
        window.addEventListener('pointerup', () => { this.lookDragging = false; });
        window.addEventListener('mousemove', (e) => {
            if (this.state !== STATE.PLAYING || this.currentQuestion) return;
            if (document.pointerLockElement === canvas || this.lookDragging) {
                this.rotateCamera(e.movementX, e.movementY);
            }
        });
    }

    startRun(settings = {}, options = {}) {
        const startLevel = clamp(options.startLevel || 1, 1, 5);
        const preserveDoorIntel = Boolean(options.preserveDoorIntel);
        this.settings = settings;
        this.questionBank.configure(settings);
        this.state = STATE.PLAYING;
        this.currentLevel = startLevel;
        this.elapsed = 0;
        this.movesMade = 0;
        this.readyMoves = 0;
        this.questionsAnswered = 0;
        this.questionsCorrect = 0;
        this.correctAnswerStreak = 0;
        this.wrongDoorAttempts = 0;
        if (!preserveDoorIntel) this.revealedFalseDoors.clear();
        this.groupHintDoors.clear();
        this.bankedMoves.clear();
        this.currentQuestion = null;
        this.questionLoading = false;
        this.questionRequestToken = null;
        this.fireWaveUntil = 0;
        this.globalHeatUntil = 0;
        this.peekUntil = 0;
        this.peekHeatUntil = 0;
        this.peekHeatStatue = null;
        this.altarAnswers = [];
        if (this.bonusAltar) {
            this.bonusAltar.used = false;
            this.bonusAltar.group.visible = true;
        }
        for (const statue of this.statues) {
            statue.heatOffset = 0;
            statue.afterFireSafeUntil = 0;
            this.setStatueFlame(statue, false);
            statue.eyeLight.visible = false;
            statue.eyeLight.intensity = 0;
            statue.coal.visible = false;
            statue.coalMat.opacity = 0.04;
        }

        if (!preserveDoorIntel || this.correctDoors.size < 2) {
            this.randomizeCorrectDoors();
        } else {
            this.refreshDoorVisuals();
        }
        if (this.currentLevel === 5) {
            this.ensureFinalDoorIntel();
        }
        this.resetPlayerForLevel();
        this.ui.hideIntro();
        this.ui.hideOverlay();
        this.ui.hideQuestion();
        this.ui.hidePeek();
        this.ui.update(this);
        const profile = this.getLevelProfile();
        this.ui.showMessage(`Режим ${this.currentLevel}: ${profile.name}. ${this.getLevelBrief(profile)}`, 4200);
    }

    restart() {
        const repeatLevel = this.state === STATE.BURNED || this.state === STATE.WRONG_DOOR;
        this.startRun(this.settings, {
            startLevel: repeatLevel ? this.currentLevel : 1,
            preserveDoorIntel: false
        });
    }

    resetPlayerForLevel() {
        this.playerBridge = 0;
        this.playerTile = 0;
        this.moveAnim = null;
        this.player.position.copy(this.bridges[0].tiles[0]);
        this.cameraYaw = this.bridges[0].angle + Math.PI;
        this.cameraPitch = 0;
        this.startGraceUntil = this.elapsed + START_GRACE;
        this.bankedMoves.clear();
        this.readyMoves = 0;
        this.releasePointerLock();
    }

    isGameplayKey(code) {
        return code === 'ArrowUp' || code === 'ArrowDown' || code === 'ArrowLeft' || code === 'ArrowRight' ||
            code === 'KeyW' || code === 'KeyA' || code === 'KeyS' || code === 'KeyD' ||
            code === 'KeyE' || code === 'Space' || code === 'Enter' || code === 'KeyR' || code === 'KeyF';
    }

    tryPointerLock() {
        const canvas = this.renderer.domElement;
        if (document.pointerLockElement === canvas || !canvas.requestPointerLock) return;
        try {
            const request = canvas.requestPointerLock();
            if (request && request.catch) request.catch(() => {});
        } catch (e) {
            // Drag-look still works when pointer lock is denied by the browser.
        }
    }

    releasePointerLock() {
        if (document.pointerLockElement === this.renderer.domElement && document.exitPointerLock) {
            document.exitPointerLock();
        }
    }

    rotateCamera(deltaX, deltaY) {
        this.cameraYaw += deltaX * LOOK_SENSITIVITY;
        this.cameraPitch = THREE.MathUtils.clamp(
            this.cameraPitch - deltaY * LOOK_SENSITIVITY,
            -MAX_CAMERA_PITCH,
            MAX_CAMERA_PITCH
        );
    }

    updateCameraBasis() {
        this._cameraForward.set(Math.cos(this.cameraYaw), 0, Math.sin(this.cameraYaw));
        this._cameraRight.crossVectors(this._cameraForward, WORLD_UP).normalize();
    }

    tryMoveRelative(forwardScale, sideScale) {
        this.updateCameraBasis();
        this._moveDesired.set(0, 0, 0)
            .addScaledVector(this._cameraForward, forwardScale)
            .addScaledVector(this._cameraRight, sideScale);

        if (this._moveDesired.lengthSq() < 1e-6) return;
        this._moveDesired.normalize();
        this.tryMoveToward(this._moveDesired);
    }

    tryMoveToward(direction) {
        let bestBridge = this.playerBridge;
        let bestTile = this.playerTile;
        let bestDot = MOVE_DOT_THRESHOLD;
        const currentBridge = this.bridges[this.playerBridge];
        const lastTile = currentBridge.tiles.length - 1;

        const consider = (bridgeIndex, tileIndex) => {
            const bridge = this.bridges[bridgeIndex];
            if (!bridge || tileIndex < 0 || tileIndex >= bridge.tiles.length) return;
            const currentPos = currentBridge.tiles[this.playerTile];
            const nextPos = bridge.tiles[tileIndex];
            this._moveCandidate.subVectors(nextPos, currentPos).setY(0);
            if (this._moveCandidate.lengthSq() < 1e-6) return;
            this._moveCandidate.normalize();

            const dot = this._moveCandidate.dot(direction);
            if (dot > bestDot) {
                bestDot = dot;
                bestBridge = bridgeIndex;
                bestTile = tileIndex;
            }
        };

        if (this.playerTile < lastTile) consider(this.playerBridge, this.playerTile + 1);
        if (this.playerTile > 0) consider(this.playerBridge, this.playerTile - 1);
        if (this.playerTile === 0) {
            consider((this.playerBridge - 1 + cfg.bridges) % cfg.bridges, 0);
            consider((this.playerBridge + 1) % cfg.bridges, 0);
        }

        if (bestBridge !== this.playerBridge || bestTile !== this.playerTile) {
            this.requestMove(bestBridge, bestTile);
        }
    }

    requestMove(toBridge, toTile) {
        if (this.questionLoading) return;
        if (toTile === cfg.tiles - 1 && this.revealedFalseDoors.has(toBridge)) {
            this.playDoorTone(false);
            this.ui.showMessage('Эта дверь уже раскрыта как ложная. Ход туда не нужен.', 1800);
            return;
        }

        if (this.readyMoves > 0) {
            this.readyMoves -= 1;
            this.beginMove(toBridge, toTile);
            this.ui.update(this);
            return;
        }

        const key = moveKey(toBridge, toTile);
        const mode = this.getLevelProfile();

        if (mode.bank) {
            const banked = this.bankedMoves.get(key);
            if (banked) {
                this.revealBankedMove(key, banked);
                return;
            }
            if (this.bankedMoves.size >= this.getBankLimit()) {
                this.ui.showMessage('Банк полон: сначала вскройте один подготовленный ход.', 1800);
                return;
            }
            this.openQuestion({ context: 'move', targetBridge: toBridge, targetTile: toTile, hiddenResult: true });
            return;
        }

        this.openQuestion({ context: 'move', targetBridge: toBridge, targetTile: toTile, hiddenResult: false });
    }

    async openQuestion(details) {
        if (this.currentQuestion || this.questionLoading || this.state !== STATE.PLAYING) return;
        this.releasePointerLock();
        this.questionLoading = true;
        const token = {};
        this.questionRequestToken = token;
        this.ui.showMessage('Генерирую вопрос...', 1200);
        const question = await this.questionBank.nextQuestion(this.getQuestionSlotForDetails(details));
        if (this.state !== STATE.PLAYING || this.questionRequestToken !== token) {
            return;
        }
        this.questionLoading = false;
        this.questionRequestToken = null;
        this.answerMarkerPosition = 0;
        this.answerMarkerIndex = 0;
        this.answerSlowHeld = false;
        this.currentQuestion = {
            ...details,
            question,
            startedAt: this.elapsed,
            markerIndex: 0
        };
        this.ui.showQuestion(this.currentQuestion, this);
    }

    getQuestionSlotForDetails(details) {
        if (!details || details.context !== 'move' || !Number.isInteger(details.targetBridge)) return null;
        const slots = this.settings.grammarSlots || [];
        const slot = slots.length ? slots[details.targetBridge % slots.length] : null;
        if (!slot || !slot.grammarTopic) return null;
        return {
            bridgeIndex: details.targetBridge,
            grammarTopic: slot.grammarTopic,
            isWortstellung: Boolean(slot.isWortstellung)
        };
    }

    setAnswerSlow(on) {
        if (!this.currentQuestion) return;
        this.answerSlowHeld = on;
        this.ui.setQuestionSlow(on);
    }

    confirmAnswer() {
        if (!this.currentQuestion) return;

        const current = this.currentQuestion;
        const selected = this.answerMarkerIndex;
        const correct = selected === current.question.correctIndex;
        const fast = this.elapsed - current.startedAt <= FAST_ANSWER_SECONDS;
        this.currentQuestion = null;
        this.answerSlowHeld = false;
        this.questionsAnswered += 1;
        this.ui.hideQuestion();

        if (current.context === 'altar') {
            this.handleAltarAnswer(correct);
            return;
        }

        if (current.hiddenResult) {
            const key = moveKey(current.targetBridge, current.targetTile);
            this.bankedMoves.set(key, {
                targetBridge: current.targetBridge,
                targetTile: current.targetTile,
                correct,
                fast
            });
            this.ui.showMessage('Ответ заложен в банк. Результат откроется при шаге.', 2200);
            this.ui.update(this);
            return;
        }

        if (correct) {
            this.questionsCorrect += 1;
            const tacticalNotes = this.onCorrectTacticalAnswer(fast);
            this.readyMoves += 1;
            const baseMessage = fast ? 'Быстрый правильный ответ. Ход готов, двери дали знак.' : 'Правильно. Ход готов.';
            const note = tacticalNotes.length ? ` ${tacticalNotes.join(' ')}` : '';
            this.ui.showMessage(`${baseMessage}${note} Выберите направление.`, 2200);
        } else {
            this.onWrongTacticalAnswer('Неверно. Ход не случился, статуя греется быстрее.');
        }

        this.ui.update(this);
    }

    revealBankedMove(key, banked) {
        this.bankedMoves.delete(key);
        if (banked.correct) {
            this.questionsCorrect += 1;
            const tacticalNotes = this.onCorrectTacticalAnswer(banked.fast);
            const note = tacticalNotes.length ? ` ${tacticalNotes.join(' ')}` : '';
            this.ui.showMessage(`Банк сработал: ход был правильным.${note}`, 1900);
            this.beginMove(banked.targetBridge, banked.targetTile);
            this.ui.update(this);
            return;
        }

        this.onWrongTacticalAnswer('Банк вскрылся ошибкой. Ход потерян, время ушло.');
        this.ui.update(this);
    }

    onCorrectTacticalAnswer(fast) {
        const notes = [];
        this.correctAnswerStreak += 1;
        if (fast) {
            if (this.revealFalseDoors(1, null) > 0) {
                notes.push('Быстрый ответ пометил одну ложную дверь.');
            }
        }
        if (this.correctAnswerStreak >= 3) {
            if (this.revealFalseDoors(1, null) > 0) {
                notes.push('Серия из трёх ответов пометила ещё одну ложную дверь.');
            }
            this.correctAnswerStreak = 0;
        }
        return notes;
    }

    onWrongTacticalAnswer(message) {
        this.correctAnswerStreak = 0;
        this.heatCurrentStatue(0.5);
        this.ui.showMessage(message, 2200);
    }

    tryActivateBonusAltar() {
        if (!this.isAtBonusAltar()) return false;
        if (this.bonusAltar.used) {
            this.ui.showMessage('Алтарь уже потух в этом забеге.', 1400);
            return true;
        }
        this.bonusAltar.used = true;
        this.bonusAltar.gemMat.opacity = 0.28;
        this.bonusAltar.light.intensity = 0.25;
        this.altarAnswers = [];
        this.openQuestion({ context: 'altar', altarIndex: 1, hiddenResult: true });
        this.ui.showMessage('Алтарь требует два ответа. Итог откроет ложные двери.', 1800);
        return true;
    }

    handleAltarAnswer(correct) {
        this.altarAnswers.push(correct);
        if (this.altarAnswers.length < 2) {
            this.openQuestion({ context: 'altar', altarIndex: this.altarAnswers.length + 1, hiddenResult: true });
            return;
        }

        const correctCount = this.altarAnswers.filter(Boolean).length;
        this.questionsCorrect += correctCount;
        if (correctCount === 2) {
            this.revealFalseDoors(2, 'Алтарь раскрыл две ложные двери.');
        } else if (correctCount === 1) {
            this.heatCurrentStatue(0.35);
            this.ui.showMessage('Алтарь принял один ответ, но подсказку не дал. Ближайшая голова слегка нагрелась.', 2400);
        } else {
            this.heatCurrentStatue(0.8);
            this.ui.showMessage('Алтарь промолчал. Ошибка дала жар ближайшей голове.', 2200);
        }
        this.ui.update(this);
    }

    isAtBonusAltar() {
        return Boolean(
            this.bonusAltar &&
            this.state === STATE.PLAYING &&
            this.playerTile === 0 &&
            this.playerBridge === this.bonusAltar.bridgeIndex
        );
    }

    tryEnterDoor() {
        if (this.playerTile !== cfg.tiles - 1) return false;

        const correct = this.correctDoors.has(this.playerBridge);
        const finalTrial = this.getLevelProfile().finalDoorTrial;

        if (this.revealedFalseDoors.has(this.playerBridge)) {
            this.playDoorTone(false);
            this.ui.showMessage('Эта дверь уже раскрыта как ложная. Ищите другой мост.', 1800);
            return true;
        }

        this.playDoorTone(correct);

        if (finalTrial) {
            this.finishRun(correct ? STATE.WON : STATE.WRONG_DOOR);
            return true;
        }

        if (correct) {
            this.advanceLevel();
            return true;
        }

        this.applyWrongDoorPenalty();
        return true;
    }

    advanceLevel() {
        if (this.currentLevel >= 5) {
            this.finishRun(STATE.WON);
            return;
        }

        this.currentLevel += 1;
        this.elapsed = 0;
        this.groupHintDoors.clear();
        this.groupHintUntil = 0;
        this.bankedMoves.clear();
        this.currentQuestion = null;
        this.answerSlowHeld = false;
        this.startGraceUntil = START_GRACE;

        if (this.currentLevel === 5) {
            this.ensureFinalDoorIntel();
        }

        this.resetPlayerForLevel();
        this.refreshDoorVisuals();
        const profile = this.getLevelProfile();
        this.ui.hideQuestion();
        this.ui.update(this);
        this.ui.showMessage(`Режим ${this.currentLevel}: ${profile.name}. ${this.getLevelBrief(profile)}`, 4600);
    }

    getLevelBrief(profile) {
        if (profile.bank) return 'Ответы можно закладывать в банк, но результат скрыт до шага.';
        if (profile.finalDoorTrial) return 'Неверная дверь завершит забег. Слушайте и смотрите на слабые символы.';
        if (profile.falseHeats) return 'Не каждый тлеющий взгляд станет струей огня.';
        if (profile.gateOffset) return 'Иногда верный ход нужно держать до окна между двумя головами.';
        return 'Базовый ритм: Enter фиксирует ответ, правильный ответ заряжает свободный ход.';
    }

    getBankLimit() {
        const profile = this.getLevelProfile();
        return profile.bankLimit || (this.currentLevel >= 4 ? 2 : 1);
    }

    pickWrongDoorPenalty() {
        const penalties = ['heat', 'wave'];
        if (this.getLevelProfile().bank && this.bankedMoves.size > 0) {
            penalties.push('clearBank');
        }
        const penalty = penalties[this.wrongDoorAttempts % penalties.length];
        this.wrongDoorAttempts += 1;
        return penalty;
    }

    applyWrongDoorPenalty() {
        const wrongBridge = this.playerBridge;
        const penalty = this.pickWrongDoorPenalty();
        const notes = ['Дверь оказалась ложной и выведена из подозрения.'];

        this.revealedFalseDoors.add(wrongBridge);
        this.groupHintDoors.delete(wrongBridge);
        this.groupHintUntil = this.groupHintDoors.size ? this.groupHintUntil : 0;
        this.readyMoves = Math.max(this.readyMoves, 1);
        this.startGraceUntil = this.elapsed + 2.0;
        notes.push('Один свободный шаг оставлен для отступления.');

        if (penalty === 'heat') {
            this.globalHeatUntil = this.elapsed + 5.5;
            for (const bridge of this.bridges) {
                const ringDistance = Math.min(
                    Math.abs(bridge.index - wrongBridge),
                    cfg.bridges - Math.abs(bridge.index - wrongBridge)
                );
                if (ringDistance <= 1) {
                    for (const statue of bridge.fireStatues) {
                        statue.heatOffset += 0.38;
                    }
                }
            }
            notes.push('Ближайшие головы слегка ускорили нагрев, но есть короткая защита от сгорания.');
        } else if (penalty === 'clearBank') {
            const count = this.bankedMoves.size;
            this.bankedMoves.clear();
            notes.push(count ? `Банк ходов сгорел: ${count}, но шаг отступления сохранён.` : 'Банк оказался пуст, штраф ушёл в лёгкий жар.');
            if (!count) this.globalHeatUntil = this.elapsed + 4;
        } else if (penalty === 'wave') {
            this.fireWaveUntil = this.elapsed + 2.8;
            notes.push('По мостам пошла короткая волна огня, но у вас есть окно защиты.');
        }

        this.correctAnswerStreak = 0;
        this.refreshDoorVisuals();
        this.ui.showMessage(notes.join(' '), 3400);
    }

    highlightDoorGroup() {
        const correct = shuffle(Array.from(this.correctDoors))[0];
        const falseDoors = shuffle(this.doors
            .map((door) => door.bridgeIndex)
            .filter((index) => !this.correctDoors.has(index)));
        const group = shuffle([correct, ...falseDoors.slice(0, 2)]);
        this.groupHintDoors = new Set(group);
        this.groupHintUntil = this.elapsed + 8.5;
        this.refreshDoorVisuals();
    }

    revealFalseDoors(count, message) {
        const candidates = shuffle(this.doors
            .map((door) => door.bridgeIndex)
            .filter((index) => !this.correctDoors.has(index) && !this.revealedFalseDoors.has(index)));

        let revealed = 0;
        for (let i = 0; i < count && i < candidates.length; i++) {
            this.revealedFalseDoors.add(candidates[i]);
            revealed += 1;
        }

        if (message) this.ui.showMessage(message, 2400);
        this.refreshDoorVisuals();
        return revealed;
    }

    ensureFinalDoorIntel() {
        const missing = Math.max(0, 4 - this.revealedFalseDoors.size);
        if (missing > 0) {
            this.revealFalseDoors(missing, 'Перед Судом дверей храм выжег лишние ложные следы.');
        }
    }

    finishRun(state) {
        this.state = state;
        this.lookDragging = false;
        this.currentQuestion = null;
        this.questionLoading = false;
        this.questionRequestToken = null;
        for (const statue of this.statues) {
            this.setStatueFlame(statue, false);
            statue.eyeLight.visible = false;
            statue.coal.visible = false;
        }
        this.releasePointerLock();
        this.ui.hideQuestion();
        this.ui.showOutcome(this.state, this);
    }

    beginMove(toBridge, toTile) {
        const from = this.player.position.clone();
        const to = this.bridges[toBridge].tiles[toTile].clone();
        this.moveAnim = { from, to, t: 0, duration: TURN_DURATION, toBridge, toTile };
    }

    update() {
        const dt = Math.min(this.clock.getDelta(), 0.05);
        this.elapsed += dt;

        this.updateQuestion(dt);
        this.updateTimedIntel();
        this.applyHeldHeat(dt);

        if (this.moveAnim) {
            this.moveAnim.t += dt;
            const k = Math.min(1, this.moveAnim.t / this.moveAnim.duration);
            const e = k * k * (3 - 2 * k);
            this.player.position.lerpVectors(this.moveAnim.from, this.moveAnim.to, e);
            this.player.position.y += Math.sin(k * Math.PI) * 0.15;
            if (k >= 1) {
                this.playerBridge = this.moveAnim.toBridge;
                this.playerTile = this.moveAnim.toTile;
                this.moveAnim = null;
                this.movesMade += 1;
                this.ui.update(this);
                if (this.playerTile === cfg.tiles - 1) {
                    this.tryEnterDoor();
                }
            }
        }

        this.updateStatues(dt);
        this.checkBurn();
        this.updateCamera(dt);
        this.manager.update();

        if (this.playerHalo) {
            this.playerHalo.material.opacity = 0.5 + Math.sin(this.elapsed * 4) * 0.2;
            this.playerHalo.rotation.z += dt * 1.5;
        }

        this.updateDoorVisuals();
        this.updateAltarVisual(dt);
    }

    updateQuestion(dt) {
        if (!this.currentQuestion) return;
        const optionCount = this.currentQuestion.question.options.length;
        const speed = ANSWER_MARKER_SPEED * (this.answerSlowHeld ? ANSWER_MARKER_SLOW : 1);
        this.answerMarkerPosition = (this.answerMarkerPosition + dt * speed) % optionCount;
        this.answerMarkerIndex = Math.floor(this.answerMarkerPosition);
        this.currentQuestion.markerIndex = this.answerMarkerIndex;
        this.ui.updateQuestionMarker(this.answerMarkerIndex, this.answerMarkerPosition % 1, this.answerSlowHeld);
    }

    updateTimedIntel() {
        if (this.groupHintUntil && this.elapsed > this.groupHintUntil) {
            this.groupHintUntil = 0;
            this.groupHintDoors.clear();
            this.refreshDoorVisuals();
            this.ui.update(this);
        }

        if (this.peekUntil && this.elapsed > this.peekUntil) {
            this.peekUntil = 0;
            this.peekHeatUntil = 0;
            this.peekHeatStatue = null;
            this.ui.hidePeek();
        } else if (this.peekUntil) {
            this.ui.showPeek(this.getNearestTimerRows());
        }
    }

    getCurrentHeatStatue() {
        const bridge = this.bridges[this.playerBridge];
        if (!bridge || !bridge.fireStatues || !bridge.fireStatues.length) return null;
        let target = null;
        let bestScore = Infinity;
        for (const statue of bridge.fireStatues) {
            const delta = statue.fireTile - this.playerTile;
            const score = delta >= 0 ? delta : Math.abs(delta) + 3;
            if (score < bestScore) {
                bestScore = score;
                target = statue;
            }
        }
        return target;
    }

    applyHeldHeat(dt) {
        let heat = 0;
        if (this.answerSlowHeld) heat += dt * 0.2;
        if (this.peekHeatUntil && this.elapsed < this.peekHeatUntil) heat += dt * PEEK_HEAT_ACCEL;
        if (heat <= 0) return;
        this.heatCurrentStatue(heat, this.peekHeatStatue);
    }

    fillStatueCycle(statue, profile, globalHeat, out = this._cycle) {
        let period = profile.period;
        let warning = profile.warning;
        let duration = profile.duration;
        const decay = profile.decay ?? BASE_FIRE_DECAY;
        let heatSpeed = profile.heatSpeed * globalHeat;
        const bridgeTiming = profile.bridgeUniqueTiming ?
            GATE_BRIDGE_TIMINGS[statue.bridgeIndex % GATE_BRIDGE_TIMINGS.length] :
            null;

        if (bridgeTiming) {
            period *= bridgeTiming.period;
            warning += bridgeTiming.warning;
            duration *= bridgeTiming.duration;
            heatSpeed *= bridgeTiming.heatSpeed;
        }

        if (profile.fastAlternate && statue.fireIndex % 2 === 0) {
            period *= 0.82;
            warning *= 0.82;
            duration *= 0.82;
            heatSpeed *= 1.04;
        }

        warning = clamp(warning, 3.2, Math.max(3.2, period - duration - decay - 1.0));

        let phaseSeed = positiveModulo(statue.phaseRatio * period, period);
        if (profile.runningWave) {
            phaseSeed = this.getRunningWavePhaseSeed(statue, period, warning);
        } else if (profile.gateOffset) {
            phaseSeed = this.getGatePhaseSeed(statue, period, warning);
        }
        if (bridgeTiming) phaseSeed = positiveModulo(phaseSeed + bridgeTiming.phase, period);

        const rawPhase = this.elapsed * heatSpeed + phaseSeed + statue.heatOffset;
        const phase = positiveModulo(rawPhase, period);
        const cycleIndex = Math.floor(rawPhase / period);

        out.period = period;
        out.warning = warning;
        out.duration = duration;
        out.decay = decay;
        out.heatSpeed = heatSpeed;
        out.phaseSeed = phaseSeed;
        out.phase = phase;
        out.fireEnd = warning + duration;
        out.decayEnd = warning + duration + decay;
        out.cycleIndex = cycleIndex;
        out.falseCycle = Boolean(
            profile.falseHeats &&
            profile.falseCycleModulo &&
            ((cycleIndex + statue.bridgeIndex * 2 + statue.fireIndex) % profile.falseCycleModulo === 0)
        );
        return out;
    }

    getRunningWavePhaseSeed(statue, period, warning) {
        const fireCount = Math.max(1, this.bridges[statue.bridgeIndex].fireStatues.length);
        const step = Math.min(2.15, period / Math.max(2, fireCount + 2));
        const targetSeconds = (fireCount - 1 - statue.fireIndex) * step;
        const bridgeDrift = statue.bridgeIndex * 0.18;
        return positiveModulo(warning - targetSeconds + bridgeDrift, period);
    }

    getGatePhaseSeed(statue, period, warning) {
        const target = GATE_FIRE_TARGETS[statue.fireIndex % GATE_FIRE_TARGETS.length] * (period / 13.0);
        return positiveModulo(warning - target, period);
    }

    updateStatues(dt) {
        const playerPos = this.player.position;
        const profile = this.getLevelProfile();
        const fireWave = this.fireWaveUntil > this.elapsed;
        const globalHeat = this.globalHeatUntil > this.elapsed ? 1.22 : 1.0;

        for (const s of this.statues) {
            const distSq = s.position.distanceToSquared(playerPos);
            const inActiveRange = distSq < FLAME_ACTIVE_RADIUS_SQ;

            if (!inActiveRange) {
                this.setStatueFlame(s, false);
                s.eyeLight.visible = false;
                s.eyeLight.intensity = 0;
                s.coal.visible = false;
                s.coalMat.opacity = 0.04;
                s.isFireActive = false;
                s.afterFireSafeUntil = 0;
                s.visualState = 'cold';
                continue;
            }

            const cycle = this.fillStatueCycle(s, profile, globalHeat);
            const phase = cycle.phase;
            const warning = cycle.warning;
            const fireEnd = cycle.fireEnd;
            const decayEnd = cycle.decayEnd;
            const falseHeatWindow = cycle.falseCycle && phase >= warning * 0.72 && phase < decayEnd;
            const rawFire = fireWave || (!falseHeatWindow && phase >= warning && phase < fireEnd);
            if (profile.postFireBreak && s.isFireActive && !rawFire) {
                s.afterFireSafeUntil = Math.max(s.afterFireSafeUntil || 0, this.elapsed + profile.postFireBreak);
            }
            const inPostFireBreak = Boolean(profile.postFireBreak && this.elapsed < (s.afterFireSafeUntil || 0));
            const isFire = !inPostFireBreak && rawFire;
            const isWarning = !inPostFireBreak && !fireWave && !falseHeatWindow && phase < warning;
            const isDecay = inPostFireBreak || (!fireWave && !cycle.falseCycle && phase >= fireEnd && phase < decayEnd);
            const falsePhase = (this.elapsed + s.falsePhase) % 7.4;
            const isFalseHeat = !fireWave && (falseHeatWindow ||
                (profile.falseHeats && !isFire && !isWarning && !isDecay && falsePhase < 1.25));

            if (!isFire && isWarning && phase > warning * 0.7) this.ensureStatueFlame(s);
            this.setStatueFlame(s, isFire);

            if (isFire) {
                s.eyeLight.visible = true;
                s.coal.visible = true;
                s.eyeLight.color.setHex(fireWave ? 0xff3300 : 0xff5522);
                s.eyeLight.intensity = 6 + Math.sin(this.elapsed * 32 + s.fireIndex) * 1.2;
                s.coalMat.color.setHex(0xff3a12);
                s.coalMat.opacity = 0.85;
                s.coal.scale.setScalar(1.35);
                s.visualState = 'fire';
            } else if (isDecay) {
                const k = inPostFireBreak ?
                    clamp(((s.afterFireSafeUntil || 0) - this.elapsed) / profile.postFireBreak, 0, 1) :
                    1 - (phase - fireEnd) / cycle.decay;
                s.eyeLight.visible = true;
                s.coal.visible = true;
                s.eyeLight.color.setHex(0xff7a22);
                s.eyeLight.intensity = 0.35 + k * 2.4;
                s.coalMat.color.setHex(0xff5a20);
                s.coalMat.opacity = 0.12 + k * 0.48;
                s.coal.scale.setScalar(0.68 + k * 0.34);
                s.visualState = 'decay';
            } else if (isWarning) {
                const k = phase / warning;
                s.eyeLight.visible = true;
                s.coal.visible = true;
                s.eyeLight.color.setHex(0xff7a22);
                s.eyeLight.intensity = 0.5 + k * 3.6 + Math.sin(this.elapsed * 18) * 0.22;
                s.coalMat.color.setHex(k > 0.68 ? 0xff4d1a : 0xffa03a);
                s.coalMat.opacity = 0.18 + k * 0.56;
                s.coal.scale.setScalar(0.75 + k * 0.45);
                s.visualState = 'warming';
            } else if (isFalseHeat) {
                const k = falseHeatWindow ?
                    1 - clamp((phase - warning * 0.72) / Math.max(0.01, decayEnd - warning * 0.72), 0, 1) :
                    1 - falsePhase / 1.25;
                s.eyeLight.visible = true;
                s.coal.visible = true;
                s.eyeLight.color.setHex(0xffaa55);
                s.eyeLight.intensity = 0.8 + k * 0.75;
                s.coalMat.color.setHex(0xc77a2b);
                s.coalMat.opacity = 0.28 + k * 0.12;
                s.coal.scale.setScalar(0.72);
                s.visualState = 'false_heat';
            } else {
                s.eyeLight.visible = false;
                s.eyeLight.intensity = 0;
                s.coal.visible = false;
                s.coalMat.opacity = 0.04;
                s.coal.scale.setScalar(0.62);
                s.visualState = 'cold';
            }

            s.isFireActive = isFire;
        }
    }

    checkBurn() {
        if (this.state !== STATE.PLAYING || this.moveAnim) return;
        if (this.elapsed < this.startGraceUntil) return;
        const bridge = this.bridges[this.playerBridge];
        for (const statue of bridge.fireStatues) {
            if (this.playerTile === statue.fireTile && statue.isFireActive) {
                this.finishRun(STATE.BURNED);
                return;
            }
        }
    }

    updateCamera(dt) {
        this._cameraPos.copy(this.player.position);
        this._cameraPos.y += CAMERA_EYE_HEIGHT;
        this.camera.position.copy(this._cameraPos);

        const pitchCos = Math.cos(this.cameraPitch);
        this._cameraTarget.set(
            this._cameraPos.x + Math.cos(this.cameraYaw) * pitchCos,
            this._cameraPos.y + Math.sin(this.cameraPitch),
            this._cameraPos.z + Math.sin(this.cameraYaw) * pitchCos
        );
        this.camera.lookAt(this._cameraTarget);
    }

    updateDoorVisuals() {
        for (const door of this.doors) {
            const bridgeIndex = door.bridgeIndex;
            const isFalseKnown = this.revealedFalseDoors.has(bridgeIndex);
            const isGroupHint = this.groupHintDoors.has(bridgeIndex);
            const isFinal = this.currentLevel === 5;
            const isCorrect = this.correctDoors.has(bridgeIndex);
            const pulse = Math.sin(this.elapsed * 3 + bridgeIndex);

            door.slab.position.y = door.slabBaseY;
            door.slabMat.opacity = 1;
            door.ring.scale.setScalar(1);
            door.symbol.rotation.z = bridgeIndex * 0.42;

            if (isFalseKnown) {
                door.slab.position.y = door.slabBaseY - 0.12;
                door.slabMat.opacity = 0.78;
                door.ring.scale.setScalar(0.97);
                door.ringMat.color.setHex(0x557985);
                door.ringMat.emissive.setHex(0x10222b);
                door.ringMat.emissiveIntensity = 0.34;
                door.slabMat.emissive.setHex(0x07141a);
                door.slabMat.emissiveIntensity = 0.12;
            } else if (isGroupHint) {
                door.ring.scale.setScalar(1.04 + Math.sin(this.elapsed * 8) * 0.015);
                door.ringMat.color.setHex(0xffd37a);
                door.ringMat.emissive.setHex(0xff6a18);
                door.ringMat.emissiveIntensity = 1.2 + Math.sin(this.elapsed * 8) * 0.35;
                door.slabMat.emissive.setHex(0x3a1306);
                door.slabMat.emissiveIntensity = 0.5;
            } else {
                door.ringMat.color.setHex(0xffaa44);
                door.ringMat.emissive.setHex(0x441100);
                door.ringMat.emissiveIntensity = 0.45 + Math.sin(this.elapsed * 2 + bridgeIndex) * 0.16;
                door.slabMat.emissive.setHex(0x110200);
                door.slabMat.emissiveIntensity = 0.28;
            }

            let symbolOpacity = isCorrect ? 0.08 + pulse * 0.025 : 0.025;
            if (isGroupHint) symbolOpacity = 0.36 + Math.sin(this.elapsed * 8 + bridgeIndex) * 0.08;
            if (isFalseKnown) symbolOpacity = 0.34;
            if (isFinal) symbolOpacity = isCorrect ? 0.48 + pulse * 0.08 : 0.13;
            door.symbolMat.opacity = Math.max(0, symbolOpacity);
            door.symbolMat.color.setHex(isFalseKnown ? 0x5ea0b6 : (isCorrect ? 0xffd88a : 0x745048));
        }
    }

    refreshDoorVisuals() {
        this.updateDoorVisuals();
        this.ui.update(this);
    }

    updateAltarVisual(dt) {
        if (!this.bonusAltar) return;
        if (this.bonusAltar.used) {
            this.bonusAltar.gem.rotation.y += dt * 0.35;
            return;
        }
        this.bonusAltar.gem.rotation.y += dt * 1.2;
        this.bonusAltar.gem.position.y = 0.58 + Math.sin(this.elapsed * 2.5) * 0.04;
        this.bonusAltar.light.intensity = 1.0 + Math.sin(this.elapsed * 3.2) * 0.22;
    }

    peekTimers() {
        this.peekUntil = this.elapsed + TIMER_PEEK_SECONDS;
        this.peekHeatUntil = this.elapsed + TIMER_PEEK_SECONDS;
        this.peekHeatStatue = this.getCurrentHeatStatue();
        if (this.peekHeatStatue) {
            this.peekHeatStatue.heatOffset += 0.18;
        }
        this.ui.showPeek(this.getNearestTimerRows());
        this.ui.showMessage('Вглядывание показывает таймеры, но подталкивает жар текущей головы.', 1900);
    }

    getNearestTimerRows() {
        const bridge = this.bridges[this.playerBridge];
        const rows = this._timerRows;
        let count = 0;
        for (let i = 0; i < bridge.fireStatues.length && count < rows.length; i++) {
            const statue = bridge.fireStatues[i];
            if (Math.abs(statue.fireTile - this.playerTile) > 2) continue;
            this.fillTimerRow(rows[count], statue);
            count += 1;
        }
        if (count === 0 && bridge.fireStatues.length) {
            this.fillTimerRow(rows[count], bridge.fireStatues[0]);
            count += 1;
        }
        return rows.slice(0, count);
    }

    fillTimerRow(row, statue) {
        const profile = this.getLevelProfile();
        const cycle = this.fillStatueCycle(
            statue,
            profile,
            this.globalHeatUntil > this.elapsed ? 1.22 : 1.0
        );

        if (this.fireWaveUntil > this.elapsed) {
            row.label = `Голова ${statue.fireIndex + 1}`;
            row.state = 'волна огня';
            row.seconds = Math.max(0, this.fireWaveUntil - this.elapsed);
            return;
        }

        const phase = cycle.phase;
        const warning = cycle.warning;
        const fireEnd = cycle.fireEnd;
        const decayEnd = cycle.decayEnd;
        const falseHeatWindow = cycle.falseCycle && phase >= warning * 0.72 && phase < decayEnd;
        row.label = `Голова ${statue.fireIndex + 1}`;
        if (profile.postFireBreak && this.elapsed < (statue.afterFireSafeUntil || 0)) {
            row.state = 'перерыв';
            row.seconds = Math.max(0, statue.afterFireSafeUntil - this.elapsed);
        } else if (falseHeatWindow) {
            row.state = 'ложное тление';
            row.seconds = Math.max(0, decayEnd - phase);
        } else if (phase < warning) {
            row.state = cycle.falseCycle && phase > warning * 0.72 ? 'ложный нагрев' : 'до огня';
            row.seconds = Math.max(0, warning - phase);
        } else if (phase < fireEnd) {
            row.state = 'струя';
            row.seconds = Math.max(0, fireEnd - phase);
        } else if (phase < decayEnd) {
            row.state = 'затухание';
            row.seconds = Math.max(0, decayEnd - phase);
        } else {
            row.state = 'холод';
            row.seconds = Math.max(0, cycle.period - phase);
        }
    }

    heatCurrentStatue(amount, preferredTarget = null) {
        const target = preferredTarget || this.getCurrentHeatStatue();
        if (target) target.heatOffset += amount;
    }

    getLevelProfile() {
        return LEVELS[this.currentLevel] || LEVELS[1];
    }

    getHudData() {
        const profile = this.getLevelProfile();
        return {
            level: this.currentLevel,
            modeName: profile.name,
            modeShort: profile.short,
            bridge: this.playerBridge + 1,
            bridges: this.bridges.length,
            tile: this.playerTile,
            tiles: this.bridges[0].tiles.length,
            inQuestion: Boolean(this.currentQuestion),
            readyMoves: this.readyMoves,
            bankedCount: this.bankedMoves.size,
            bankLimit: this.getBankLimit(),
            revealedFalse: this.revealedFalseDoors.size,
            correctDoors: this.correctDoors.size,
            groupHintCount: this.groupHintDoors.size,
            altarReady: this.isAtBonusAltar() && !this.bonusAltar.used,
            finalTrial: profile.finalDoorTrial,
            heatActive: this.globalHeatUntil > this.elapsed,
            fireWaveActive: this.fireWaveUntil > this.elapsed,
            questionsAnswered: this.questionsAnswered,
            questionsCorrect: this.questionsCorrect
        };
    }

    playDoorTone(correct) {
        try {
            if (!this.audioContext) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (!AudioContext) return;
                this.audioContext = new AudioContext();
            }
            const ctx = this.audioContext;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = correct ? 'sine' : 'triangle';
            osc.frequency.value = correct ? 520 : 360;
            gain.gain.setValueAtTime(0.0001, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.32);
            osc.connect(gain).connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.34);
        } catch (error) {
            // Audio is optional; browser autoplay policy can block it.
        }
    }

    render() {
        this.renderer.render(this.scene, this.camera);
        this.manager.render(this.renderer, this.camera);
    }
}
