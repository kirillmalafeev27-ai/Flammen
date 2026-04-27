import * as THREE from 'three';
import * as Photons from '../lib/photons.module.js';
import { GLTFLoader } from './GltfLoader.js';
import { MeshoptDecoder } from '../lib/meshopt_decoder.module.js';
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
const FIRE_PERIOD = 3.0;
const FIRE_WARNING = 0.5;
const FIRE_DURATION = 1.0;

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
        this.bindInput();
    }

    async build() {
        await this.loadAssets();
        this.layoutWorld();
        this.spawnPlayer();
        this.placeStatuesAndDoors();
        this.randomizeCorrectDoors();
        this.ui.showIntro();
    }

    async loadAssets() {
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

    layoutWorld() {
        const box = new THREE.Box3().setFromObject(this.templeRoot);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);

        const radiusXZ = 0.5 * Math.max(size.x, size.z);
        if (!isFinite(cfg.rOuter)) cfg.rOuter = radiusXZ * 0.86;
        if (!isFinite(cfg.rInner)) cfg.rInner = radiusXZ * 0.30;
        if (!isFinite(cfg.bridgeY)) cfg.bridgeY = box.min.y + size.y * 0.52;

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
                const isFire = (t === 1 || t === b.tiles.length - 2);
                const isDoor = (t === b.tiles.length - 1);
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
        group.add(body);

        const halo = new THREE.Mesh(
            new THREE.RingGeometry(0.35, 0.5, 24),
            new THREE.MeshBasicMaterial({ color: 0x88ddff, side: THREE.DoubleSide, transparent: true, opacity: 0.7 })
        );
        halo.rotation.x = -Math.PI / 2;
        halo.position.y = 0.02;
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
            const outerStatue = this.makeStatue(b.tiles[1], b, +1);
            const innerStatue = this.makeStatue(b.tiles[b.tiles.length - 2], b, -1);
            outerStatue.fireTile = 1;
            innerStatue.fireTile = b.tiles.length - 2;
            outerStatue.firePhase = Math.random() * FIRE_PERIOD;
            innerStatue.firePhase = (Math.random() * FIRE_PERIOD + FIRE_PERIOD * 0.5) % FIRE_PERIOD;
            outerStatue.bridgeIndex = b.index;
            innerStatue.bridgeIndex = b.index;
            this.statues.push(outerStatue, innerStatue);
            b.outerStatue = outerStatue;
            b.innerStatue = innerStatue;

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
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;

            if (this.state === STATE.INTRO) {
                if (e.code === 'Enter' || e.code === 'Space') this.startRun();
                return;
            }
            if (this.state === STATE.WON || this.state === STATE.BURNED || this.state === STATE.WRONG_DOOR) {
                if (e.code === 'KeyR' || e.code === 'Enter' || e.code === 'Space') this.restart();
                return;
            }
            if (this.state !== STATE.PLAYING || this.moveAnim) return;

            switch (e.code) {
                case 'ArrowUp': case 'KeyW': this.tryStepForward(); break;
                case 'ArrowDown': case 'KeyS': this.tryStepBack(); break;
                case 'ArrowLeft': case 'KeyA': this.tryRotateBridge(-1); break;
                case 'ArrowRight': case 'KeyD': this.tryRotateBridge(+1); break;
                case 'KeyE': case 'Space': this.tryEnterDoor(); break;
            }
        });
        window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    }

    startRun() {
        this.state = STATE.PLAYING;
        this.playerBridge = 0;
        this.playerTile = 0;
        this.player.position.copy(this.bridges[0].tiles[0]);
        this.ui.hideIntro();
        this.ui.update(this);
    }

    restart() {
        this.randomizeCorrectDoors();
        this.startRun();
        this.ui.hideOverlay();
    }

    tryStepForward() {
        if (this.playerTile >= cfg.tiles - 1) return;
        this.beginMove(this.playerBridge, this.playerTile + 1);
    }
    tryStepBack() {
        if (this.playerTile <= 0) return;
        this.beginMove(this.playerBridge, this.playerTile - 1);
    }
    tryRotateBridge(dir) {
        if (this.playerTile !== 0) return;
        const next = (this.playerBridge + dir + cfg.bridges) % cfg.bridges;
        this.beginMove(next, 0);
    }
    tryEnterDoor() {
        if (this.playerTile !== cfg.tiles - 1) return;
        const correct = this.correctDoors.has(this.playerBridge);
        this.state = correct ? STATE.WON : STATE.WRONG_DOOR;
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
        const bridge = this.bridges[this.playerBridge];
        const outer = bridge.outerStatue;
        const inner = bridge.innerStatue;
        const onOuterDanger = (this.playerTile === outer.fireTile);
        const onInnerDanger = (this.playerTile === inner.fireTile);

        if ((onOuterDanger && outer.isFireActive) || (onInnerDanger && inner.isFireActive)) {
            this.state = STATE.BURNED;
            this.ui.showOutcome(STATE.BURNED);
        }
    }

    updateCamera(dt) {
        const target = this.player.position.clone();
        const radial = new THREE.Vector3().subVectors(target, this.center).setY(0);
        const radialN = radial.lengthSq() > 1e-4 ? radial.clone().normalize() : new THREE.Vector3(1, 0, 0);
        const camOffset = radialN.clone().multiplyScalar(5).add(new THREE.Vector3(0, 4.5, 0));
        const desiredPos = target.clone().add(camOffset);
        this.camera.position.lerp(desiredPos, 1 - Math.exp(-dt * 5));
        this.camera.lookAt(target.x, target.y + 0.8, target.z);
    }

    render() {
        this.renderer.render(this.scene, this.camera);
        this.manager.render(this.renderer, this.camera);
    }
}
