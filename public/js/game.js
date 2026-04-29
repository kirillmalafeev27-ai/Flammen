import * as THREE from 'three';
import * as Photons from '../lib/photons.module.js';
import { GLTFLoader } from './GltfLoader.js';
import { buildFlamethrower } from './flamethrower.js';

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

const TURN_DURATION = 0.18;
const FIRE_PERIOD = 4.8;
const FIRE_WARNING = 0.65;
const FIRE_DURATION = 1.55;
const CAMERA_EYE_HEIGHT = 1.35;
const LOOK_SENSITIVITY = 0.0022;
const MAX_CAMERA_PITCH = Math.PI * 0.42;
const MOVE_DOT_THRESHOLD = 0.35;
const START_GRACE = 0.8;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const MOAI_FACE_YAW = Math.PI;

const STATE = {
    INTRO: 'intro',
    PLAYING: 'playing',
    BURNED: 'burned',
    WRONG_DOOR: 'wrong_door',
    WON: 'won'
};

export class Game {
    constructor(scene, camera, renderer, ui) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.ui = ui;
        this.clock = new THREE.Clock();
        this.elapsed = 0;
        this.manager = new Photons.Manager();

        this.state = STATE.INTRO;
        this.bridges = [];
        this.statues = [];
        this.doors = [];
        this.correctDoors = new Set();

        this.player = null;
        this.playerBridge = 0;
        this.playerTile = 0;
        this.moveAnim = null;

        this.keys = {};
        this.cameraYaw = 0;
        this.cameraPitch = 0;
        this.lookDragging = false;
        this.startGraceUntil = 0;

        this._cameraPos = new THREE.Vector3();
        this._cameraTarget = new THREE.Vector3();
        this._cameraForward = new THREE.Vector3();
        this._cameraRight = new THREE.Vector3();
        this._moveDesired = new THREE.Vector3();
        this._moveCandidate = new THREE.Vector3();
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
                const isFire = !isDoor;
                const color = isDoor ? 0x00ff00 : isFire ? 0xff3300 : 0x3399ff;
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
            b.fireStatues = [];
            for (let t = 0; t < doorTile; t++) {
                const side = (t % 2 === 0) ? -1 : +1;
                const statue = this.makeStatue(b.tiles[t], b, side);
                statue.fireTile = t;
                statue.firePhase = this.getFirePhase(b.index, t, doorTile);
                statue.bridgeIndex = b.index;
                this.statues.push(statue);
                b.fireStatues.push(statue);
            }

            const doorPos = b.tiles[b.tiles.length - 1].clone();
            const door = this.makeDoor(doorPos, b);
            this.doors.push(door);
            b.door = door;
        }

        for (let i = 0; i < cfg.bridges; i++) {
            const angle = cfg.bridgePhase + ((i + 0.5) / cfg.bridges) * Math.PI * 2;
            const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
            const pos = this.center.clone().add(dir.clone().multiplyScalar(cfg.rOuter * 0.98));
            const decor = this.makeStatueMesh(pos, dir.clone().multiplyScalar(-1));
            this.scene.add(decor);
        }
    }

    getFirePhase(bridgeIndex, tileIndex, fireTileCount) {
        const tileStep = FIRE_PERIOD / Math.max(1, fireTileCount);
        const bridgeStep = FIRE_PERIOD / Math.max(1, cfg.bridges);
        return (tileIndex * tileStep + bridgeIndex * bridgeStep * 0.5) % FIRE_PERIOD;
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
        const flame = buildFlamethrower(fireOrigin, this.renderer, {
            scale: cfg.fireScale,
            releaseMultiplier: cfg.releaseMul,
            animSpeed: 2.2,
            direction: facingDir
        });

        this.manager.addParticleSystem(flame.systems.embers);
        this.manager.addParticleSystem(flame.systems.baseFlame);
        this.manager.addParticleSystem(flame.systems.brightFlame);

        const eyeLight = new THREE.PointLight(0xff5522, 0, 5, 2.0);
        eyeLight.position.copy(fireOrigin.position);
        this.scene.add(eyeLight);

        return {
            group, fireOrigin, flame, eyeLight,
            position: statuePos, facing: facingDir, tilePosition: tilePos.clone()
        };
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
            emissive: 0x110200, emissiveIntensity: 0.3
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

        group.position.copy(position);
        const inward = new THREE.Vector3().subVectors(this.center, position).setY(0).normalize();
        group.lookAt(position.clone().add(inward));
        this.scene.add(group);

        return { group, slab, ring, position: position.clone(), bridgeIndex: bridge.index, ringMat };
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
    }

    bindInput() {
        const canvas = this.renderer.domElement;
        canvas.tabIndex = 0;

        window.addEventListener('keydown', (e) => {
            if (this.isGameplayKey(e.code)) e.preventDefault();
            this.keys[e.code] = true;

            if (this.state === STATE.INTRO) {
                if (e.code === 'Enter' || e.code === 'Space') {
                    this.startRun();
                    this.tryPointerLock();
                }
                return;
            }
            if (this.state === STATE.WON || this.state === STATE.BURNED || this.state === STATE.WRONG_DOOR) {
                if (e.code === 'KeyR' || e.code === 'Enter' || e.code === 'Space') {
                    this.restart();
                    this.tryPointerLock();
                }
                return;
            }
            if (this.state !== STATE.PLAYING || this.moveAnim) return;

            switch (e.code) {
                case 'ArrowUp': case 'KeyW': this.tryMoveRelative(1, 0); break;
                case 'ArrowDown': case 'KeyS': this.tryMoveRelative(-1, 0); break;
                case 'ArrowLeft': case 'KeyA': this.tryMoveRelative(0, -1); break;
                case 'ArrowRight': case 'KeyD': this.tryMoveRelative(0, 1); break;
                case 'KeyE': case 'Space': this.tryEnterDoor(); break;
            }
        });
        window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

        canvas.addEventListener('pointerdown', (e) => {
            if (this.state !== STATE.PLAYING) return;
            this.lookDragging = true;
            canvas.focus();
            this.tryPointerLock();
            e.preventDefault();
        });
        window.addEventListener('pointerup', () => { this.lookDragging = false; });
        window.addEventListener('mousemove', (e) => {
            if (this.state !== STATE.PLAYING) return;
            if (document.pointerLockElement === canvas || this.lookDragging) {
                this.rotateCamera(e.movementX, e.movementY);
            }
        });
    }

    startRun() {
        this.state = STATE.PLAYING;
        this.elapsed = 0;
        this.playerBridge = 0;
        this.playerTile = 0;
        this.player.position.copy(this.bridges[0].tiles[0]);
        this.cameraYaw = this.bridges[0].angle + Math.PI;
        this.cameraPitch = 0;
        this.startGraceUntil = this.elapsed + START_GRACE;
        this.ui.hideIntro();
        this.ui.update(this);
    }

    restart() {
        this.randomizeCorrectDoors();
        this.startRun();
        this.ui.hideOverlay();
    }

    isGameplayKey(code) {
        return code === 'ArrowUp' || code === 'ArrowDown' || code === 'ArrowLeft' || code === 'ArrowRight' ||
            code === 'KeyW' || code === 'KeyA' || code === 'KeyS' || code === 'KeyD' ||
            code === 'KeyE' || code === 'Space' || code === 'Enter' || code === 'KeyR';
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
            this.beginMove(bestBridge, bestTile);
        }
    }

    tryEnterDoor() {
        if (this.playerTile !== cfg.tiles - 1) return;
        const correct = this.correctDoors.has(this.playerBridge);
        this.finishRun(correct ? STATE.WON : STATE.WRONG_DOOR);
    }

    finishRun(state) {
        this.state = state;
        this.lookDragging = false;
        this.releasePointerLock();
        this.ui.showOutcome(this.state);
    }

    beginMove(toBridge, toTile) {
        const from = this.player.position.clone();
        const to = this.bridges[toBridge].tiles[toTile].clone();
        this.moveAnim = { from, to, t: 0, duration: TURN_DURATION, toBridge, toTile };
    }

    update() {
        const dt = Math.min(this.clock.getDelta(), 0.05);
        this.elapsed += dt;

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
                this.ui.update(this);
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
        for (const door of this.doors) {
            door.ringMat.emissiveIntensity = 0.5 + Math.sin(this.elapsed * 2 + door.bridgeIndex) * 0.2;
        }
    }

    updateStatues(dt) {
        const playerPos = this.player.position;
        for (const s of this.statues) {
            const distSq = s.position.distanceToSquared(playerPos);
            const inActiveRange = distSq < 144;

            if (!inActiveRange) {
                if (s.flame.isFiring()) s.flame.setFiring(false);
                s.eyeLight.intensity = 0;
                s.isFireActive = false;
                continue;
            }

            const phase = (this.elapsed + s.firePhase) % FIRE_PERIOD;
            const isFire = phase >= FIRE_WARNING && phase < FIRE_WARNING + FIRE_DURATION;
            const isWarning = phase < FIRE_WARNING;

            if (isFire !== s.flame.isFiring()) s.flame.setFiring(isFire);

            if (isFire) {
                s.eyeLight.intensity = 6 + Math.random() * 2;
            } else if (isWarning) {
                const k = phase / FIRE_WARNING;
                s.eyeLight.intensity = k * 2.5;
            } else {
                s.eyeLight.intensity *= Math.exp(-dt * 5);
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

    render() {
        this.renderer.render(this.scene, this.camera);
        this.manager.render(this.renderer, this.camera);
    }
}
