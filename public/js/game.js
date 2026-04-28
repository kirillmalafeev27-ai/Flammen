import * as THREE from 'three';
import * as Photons from '../lib/photons.module.js';
import { GLTFLoader } from './GltfLoader.js';
import { MeshoptDecoder } from '../lib/meshopt_decoder.module.js';
import { buildFlamethrower } from './flamethrower.js';

const params = new URLSearchParams(location.search);
const readInt = (name, fallback, min) => {
    const value = parseInt(params.get(name) || `${fallback}`, 10);
    return Math.max(min, Number.isFinite(value) ? value : fallback);
};
const readFloat = (name, fallback) => {
    const value = parseFloat(params.get(name) || `${fallback}`);
    return Number.isFinite(value) ? value : fallback;
};
const readOptionalFloat = (name) => {
    const value = parseFloat(params.get(name) || 'NaN');
    return Number.isFinite(value) ? value : NaN;
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const cfg = {
    bridges: readInt('bridges', 8, 3),
    tiles: readInt('tiles', 6, 4),
    rInner: readOptionalFloat('rInner'),
    rOuter: readOptionalFloat('rOuter'),
    bridgePhase: readFloat('phase', 0),
    bridgeY: readOptionalFloat('y'),
    moaiHeight: readFloat('moaiH', 1.45),
    fireScale: readOptionalFloat('fireScale'),
    releaseMul: readFloat('release', 18),
    sideOffset: readOptionalFloat('side'),
    fireMouthY: readOptionalFloat('mouthY'),
    debug: params.has('debug')
};

const TURN_DURATION = 0.18;
const FIRE_PERIOD = 3.0;
const FIRE_WARNING = 0.5;
const FIRE_DURATION = 1.0;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const CAMERA_TARGET_HEIGHT = 0.85;

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

        this.tileSpacing = 1;
        this.statueSideOffset = 1.1;
        this.statueRadialOffset = 0.25;
        this.statueBaseHeight = 0.22;
        this.statueBaseRadius = 0.44;
        this.fireMouthY = 1.05;
        this.fireForwardOffset = 0.32;
        this.doorSetback = 0.6;
        this.cameraDistance = 5.8;
        this.cameraHeight = 4.6;
        this.cameraShoulder = 0.8;

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
        this.statueBaseHeight = clamp(cfg.moaiHeight * 0.15, 0.18, 0.28);
        this.statueBaseRadius = clamp(cfg.moaiHeight * 0.28, 0.36, 0.52);
        this.fireMouthY = Number.isFinite(cfg.fireMouthY) ? cfg.fireMouthY : this.statueBaseHeight + cfg.moaiHeight * 0.60;
        this.fireForwardOffset = clamp(cfg.moaiHeight * 0.22, 0.28, 0.42);

        this.statueStoneMat = new THREE.MeshStandardMaterial({
            color: 0x5b5147,
            roughness: 0.92,
            metalness: 0.02
        });
        this.doorStoneMat = new THREE.MeshStandardMaterial({
            color: 0x4b433b,
            roughness: 0.9,
            metalness: 0.02
        });
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
        this.tileSpacing = (cfg.rOuter - cfg.rInner) / Math.max(1, cfg.tiles - 1);
        this.statueSideOffset = Number.isFinite(cfg.sideOffset) ? clamp(cfg.sideOffset, 0.75, 1.7) : clamp(this.tileSpacing * 0.55, 0.95, 1.45);
        this.statueRadialOffset = clamp(this.tileSpacing * 0.16, 0.18, 0.42);
        this.doorSetback = clamp(this.tileSpacing * 0.34, 0.45, 0.9);
        this.cameraDistance = clamp(this.tileSpacing * 2.15, 4.8, 8.0);
        this.cameraHeight = clamp(this.tileSpacing * 1.65, 3.8, 6.2);
        this.cameraShoulder = clamp(this.tileSpacing * 0.36, 0.55, 1.2);
        if (!Number.isFinite(cfg.fireScale)) {
            cfg.fireScale = clamp(this.statueSideOffset * 0.16, 0.18, 0.28);
        }

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
            new THREE.CapsuleGeometry(0.23, 0.68, 6, 12),
            new THREE.MeshStandardMaterial({
                color: 0x7a5434,
                roughness: 0.78,
                metalness: 0.03,
                emissive: 0x2c1307,
                emissiveIntensity: 0.3
            })
        );
        body.position.y = 0.6;
        body.castShadow = false;
        group.add(body);

        const marker = new THREE.Mesh(
            new THREE.RingGeometry(0.34, 0.45, 16),
            new THREE.MeshBasicMaterial({ color: 0xff9a3d, side: THREE.DoubleSide, transparent: true, opacity: 0.45 })
        );
        marker.rotation.x = -Math.PI / 2;
        marker.position.y = 0.02;
        group.add(marker);
        this.playerMarker = marker;

        const torch = new THREE.PointLight(0xff8a3d, 1.25, 5.5, 2.0);
        torch.position.y = 1.2;
        group.add(torch);

        this.scene.add(group);
        this.player = group;
        this.player.position.copy(this.bridges[0].tiles[0]);
        this.snapCameraToPlayer();
    }

    placeStatuesAndDoors() {
        for (const b of this.bridges) {
            const outerStatue = this.makeStatue(1, b, +1, +1);
            const innerStatue = this.makeStatue(b.tiles.length - 2, b, -1, -1);
            outerStatue.fireTile = 1;
            innerStatue.fireTile = b.tiles.length - 2;
            outerStatue.firePhase = (b.index / cfg.bridges) * FIRE_PERIOD;
            innerStatue.firePhase = (outerStatue.firePhase + FIRE_PERIOD * 0.5) % FIRE_PERIOD;
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
    }

    makeStatue(tileIndex, bridge, side, radialSide) {
        const group = new THREE.Group();
        this.scene.add(group);

        const tilePos = bridge.tiles[tileIndex];
        const lateral = new THREE.Vector3().crossVectors(bridge.dir, WORLD_UP).normalize();
        const sideVec = lateral.clone().multiplyScalar(side * this.statueSideOffset);
        const radialVec = bridge.dir.clone().multiplyScalar(radialSide * this.statueRadialOffset);
        const statuePos = tilePos.clone().add(sideVec).add(radialVec);

        const facingDir = sideVec.clone().multiplyScalar(-1).normalize();
        const moai = this.makeStatueMesh(statuePos, facingDir);
        group.add(moai);

        const fireOrigin = new THREE.Object3D();
        fireOrigin.position.copy(statuePos);
        fireOrigin.position.y += this.fireMouthY;
        fireOrigin.position.add(facingDir.clone().multiplyScalar(this.fireForwardOffset));
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
        inner.position.y = this.statueBaseHeight - this.moaiTemplateMinY * this.moaiTemplateScale - 0.02;

        const wrap = new THREE.Group();
        const base = new THREE.Mesh(
            new THREE.CylinderGeometry(this.statueBaseRadius, this.statueBaseRadius * 1.12, this.statueBaseHeight, 8),
            this.statueStoneMat
        );
        base.position.y = this.statueBaseHeight * 0.5;
        wrap.add(base);
        wrap.add(inner);
        wrap.position.copy(position);
        wrap.lookAt(position.clone().add(facingDir));

        const stoneTint = new THREE.Color(0x5d554c);
        wrap.traverse(o => {
            if (o.isMesh) {
                o.castShadow = false;
                o.receiveShadow = false;
                if (o !== base && o.material) {
                    const materials = Array.isArray(o.material) ? o.material : [o.material];
                    const styled = materials.map(material => {
                        const clone = material.clone();
                        if (clone.color) clone.color.lerp(stoneTint, 0.48);
                        if ('roughness' in clone) clone.roughness = Math.max(clone.roughness ?? 0, 0.82);
                        if ('metalness' in clone) clone.metalness = Math.min(clone.metalness ?? 0, 0.04);
                        return clone;
                    });
                    o.material = Array.isArray(o.material) ? styled : styled[0];
                }
            }
        });
        return wrap;
    }

    makeDoor(position, bridge) {
        const group = new THREE.Group();
        const frameMat = this.doorStoneMat;
        const slabMat = new THREE.MeshStandardMaterial({
            color: 0x17110d, roughness: 0.86, metalness: 0.05,
            emissive: 0x120603, emissiveIntensity: 0.18
        });
        const emberMat = new THREE.MeshStandardMaterial({
            color: 0xff8a33,
            emissive: 0xff3a12,
            emissiveIntensity: 0.45,
            roughness: 0.55,
            transparent: true,
            opacity: 0.78
        });

        const leftPillar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.65, 0.38), frameMat);
        leftPillar.position.set(-0.68, 0.85, 0);
        const rightPillar = leftPillar.clone();
        rightPillar.position.x = 0.68;
        const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.32, 0.42), frameMat);
        lintel.position.set(0, 1.76, 0);
        const threshold = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.16, 0.56), frameMat);
        threshold.position.set(0, 0.08, 0.06);
        const slab = new THREE.Mesh(new THREE.BoxGeometry(0.98, 1.34, 0.12), slabMat);
        slab.position.set(0, 0.82, 0.1);
        const emberSlit = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.86, 0.03), emberMat);
        emberSlit.position.set(0, 0.86, 0.18);
        group.add(leftPillar, rightPillar, lintel, threshold, slab, emberSlit);

        const inward = new THREE.Vector3().subVectors(this.center, position).setY(0).normalize();
        const doorPosition = position.clone().add(inward.clone().multiplyScalar(this.doorSetback));
        group.position.copy(doorPosition);
        group.lookAt(doorPosition.clone().add(inward));
        this.scene.add(group);

        return { group, slab, emberSlit, position: position.clone(), bridgeIndex: bridge.index, emberMat };
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
        const onKeyDown = (e) => {
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
        };

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('pointerdown', () => {
            if (this.state === STATE.INTRO) this.startRun();
        });
        document.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    }

    startRun() {
        this.state = STATE.PLAYING;
        this.playerBridge = 0;
        this.playerTile = 0;
        this.player.position.copy(this.bridges[0].tiles[0]);
        this.snapCameraToPlayer();
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

        if (this.playerMarker) {
            this.playerMarker.material.opacity = 0.38 + Math.sin(this.elapsed * 4) * 0.12;
            this.playerMarker.rotation.z += dt * 1.5;
        }
        for (const door of this.doors) {
            door.emberMat.emissiveIntensity = 0.32 + Math.sin(this.elapsed * 1.7 + door.bridgeIndex) * 0.12;
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
        const { position, target } = this.getCameraPose();
        this.camera.position.lerp(position, 1 - Math.exp(-dt * 5));
        this.camera.lookAt(target);
    }

    snapCameraToPlayer() {
        const { position, target } = this.getCameraPose();
        this.camera.position.copy(position);
        this.camera.lookAt(target);
    }

    getCameraPose() {
        const target = this.player.position.clone();
        const radial = new THREE.Vector3().subVectors(target, this.center).setY(0);
        const radialN = radial.lengthSq() > 1e-4 ? radial.clone().normalize() : new THREE.Vector3(1, 0, 0);
        const tangent = new THREE.Vector3(-radialN.z, 0, radialN.x).multiplyScalar(this.cameraShoulder);
        const position = target.clone()
            .add(radialN.multiplyScalar(this.cameraDistance))
            .add(tangent)
            .add(WORLD_UP.clone().multiplyScalar(this.cameraHeight));
        target.y += CAMERA_TARGET_HEIGHT;
        return { position, target };
    }

    render() {
        this.renderer.render(this.scene, this.camera);
        this.manager.render(this.renderer, this.camera);
    }
}
