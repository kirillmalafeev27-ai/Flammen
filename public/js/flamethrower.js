import * as THREE from 'three';
import * as Photons from '../lib/photons.module.js';

let renderSlot = 1;

const EMBER_RATE_BASE = 6;
const BASE_FLAME_RATE_BASE = 10;
const BRIGHT_FLAME_RATE_BASE = 5;
const textureLoader = new THREE.TextureLoader();
const atlasCache = new Map();

export function buildFlamethrower(parent, threeRenderer, opts = {}) {
    const scale = opts.scale ?? 0.18;
    const releaseMultiplier = opts.releaseMultiplier ?? 25;
    const animSpeed = opts.animSpeed ?? 2.5;
    const direction = opts.direction ? opts.direction.clone().normalize() : new THREE.Vector3(0, 0, -1);

    const root = new THREE.Object3D();
    parent.add(root);

    const orient = new THREE.Quaternion();
    orient.setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
    root.quaternion.copy(orient);

    const systems = {
        embers: setupEmbers(root, threeRenderer, scale, releaseMultiplier, animSpeed),
        baseFlame: setupBaseFlame(root, threeRenderer, scale, releaseMultiplier, animSpeed),
        brightFlame: setupBrightFlame(root, threeRenderer, scale, releaseMultiplier, animSpeed)
    };

    const baseRates = {
        embers: EMBER_RATE_BASE * releaseMultiplier,
        baseFlame: BASE_FLAME_RATE_BASE * releaseMultiplier,
        brightFlame: BRIGHT_FLAME_RATE_BASE * releaseMultiplier
    };

    let firing = false;
    for (const system of Object.values(systems)) {
        system.particleEmitter.emissionRate = 0;
        system.onUpdate((activeCount) => {
            if (!firing && activeCount === 0) {
                system.setVisibile(false);
                system.pause();
                resetEmitter(system);
            }
        });
    }

    function resetEmitter(system) {
        if (system.particleEmitter) {
            system.particleEmitter.age = 0;
            system.particleEmitter.timeActive = 0;
            system.particleEmitter.emitCount = 0;
        }
    }

    function startSystem(system) {
        resetEmitter(system);
        system.setVisibile(true);
        system.start();
    }

    function stopSystemWhenIdle(system) {
        if (system.activeParticleCount === 0) {
            system.setVisibile(false);
            system.pause();
            resetEmitter(system);
        }
    }

    function setFiring(on) {
        if (on === firing) return;
        firing = on;
        const m = on ? 1 : 0;
        systems.embers.particleEmitter.emissionRate = baseRates.embers * m;
        systems.baseFlame.particleEmitter.emissionRate = baseRates.baseFlame * m;
        systems.brightFlame.particleEmitter.emissionRate = baseRates.brightFlame * m;
        for (const system of Object.values(systems)) {
            if (on) {
                startSystem(system);
            } else {
                stopSystemWhenIdle(system);
            }
        }
    }

    function setIntensity(mult) {
        systems.embers.particleEmitter.emissionRate = baseRates.embers * mult;
        systems.baseFlame.particleEmitter.emissionRate = baseRates.baseFlame * mult;
        systems.brightFlame.particleEmitter.emissionRate = baseRates.brightFlame * mult;
        const active = mult > 0;
        if (active !== firing) firing = active;
        for (const system of Object.values(systems)) {
            if (active) {
                startSystem(system);
            } else {
                stopSystemWhenIdle(system);
            }
        }
    }

    return { root, systems, setFiring, setIntensity, isFiring: () => firing };
}

function getAtlas(path, frames, frameWidth, frameHeight) {
    const key = `${path}:${frames}:${frameWidth}:${frameHeight}`;
    if (atlasCache.has(key)) return atlasCache.get(key);

    const tex = textureLoader.load(path);
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;

    const atlas = new Photons.Atlas(tex, path);
    atlas.addFrameSet(frames, 0.0, 0.0, frameWidth, frameHeight);
    atlasCache.set(key, atlas);
    return atlas;
}

function setupEmbers(parent, threeRenderer, scale, releaseMultiplier, animSpeed) {
    const root = new THREE.Object3D();
    parent.add(root);

    const path = 'assets/textures/ember.png';
    const atlas = getAtlas(path, 1, 1.0, 1.0);
    const psRenderer = new Photons.AnimatedSpriteRenderer(true, atlas, true, THREE.AdditiveBlending, true, renderSlot++);

    const ps = new Photons.ParticleSystem(root, psRenderer, threeRenderer);
    ps.init(150 * releaseMultiplier);
    ps.setEmitter(new Photons.ConstantParticleEmitter(EMBER_RATE_BASE * releaseMultiplier));

    const sizeGen = new Photons.RandomGenerator(
        THREE.Vector2,
        new THREE.Vector2(0.0, 0.0),
        new THREE.Vector2(scale * 0.15, scale * 0.15),
        0.0, 0.0, false
    );
    ps.addParticleStateInitializer(new Photons.LifetimeInitializer(3.0 * animSpeed, 1.0 * animSpeed, 0.0, 0.0, false));
    ps.addParticleStateInitializer(new Photons.SizeInitializer(sizeGen));
    ps.addParticleStateInitializer(new Photons.BoxPositionInitializer(
        new THREE.Vector3(0.05 * scale, 0.0, 0.05 * scale),
        new THREE.Vector3(-0.025 * scale, 0.0, -0.025 * scale)
    ));

    const vFactor = animSpeed * scale;
    ps.addParticleStateInitializer(new Photons.RandomVelocityInitializer(
        new THREE.Vector3(0, 0.5, 0),
        new THREE.Vector3(0, -0.25, -1),
        2 * vFactor, 2 * vFactor
    ));

    const opacityOp = ps.addParticleStateOperator(new Photons.OpacityInterpolatorOperator());
    opacityOp.addElements([
        [0.0, 0.0],
        [0.7, 0.25],
        [0.9, 0.75],
        [0.0, 1.0]
    ]);

    const colorOp = ps.addParticleStateOperator(new Photons.ColorInterpolatorOperator(true));
    colorOp.addElementsFromParameters([
        [[1.0, 0.7, 0.0], 0.0],
        [[1.0, 0.6, 0.0], 0.5],
        [[1.0, 0.4, 0.0], 1.0]
    ]);

    const accelGen = new Photons.SphereRandomGenerator(
        Math.PI * 2.0, 0.0, Math.PI,
        -Math.PI / 2, 5.0, -2,
        scale, scale, scale,
        0.0, 0.0, 0.0
    );
    ps.addParticleStateOperator(new Photons.AccelerationOperator(accelGen));

    ps.setSimulateInWorldSpace(true);
    ps.setVisibile(false);
    ps.pause();
    return ps;
}

function setupBaseFlame(parent, threeRenderer, scale, releaseMultiplier, animSpeed) {
    const root = new THREE.Object3D();
    parent.add(root);

    const path = 'assets/textures/base_flame.png';
    const atlas = getAtlas(path, 18, 128.0 / 1024.0, 128.0 / 512.0);
    const psRenderer = new Photons.AnimatedSpriteRenderer(true, atlas, true, THREE.NormalBlending, true, renderSlot++);

    const ps = new Photons.ParticleSystem(root, psRenderer, threeRenderer);
    ps.init(50 * releaseMultiplier);
    ps.setEmitter(new Photons.ConstantParticleEmitter(BASE_FLAME_RATE_BASE * releaseMultiplier));

    ps.addParticleSequence(0, 18);
    const sequences = ps.getParticleSequences();

    ps.addParticleStateInitializer(new Photons.LifetimeInitializer(0.0, 0.0, 0.0, 0.0, false));
    ps.addParticleStateInitializer(new Photons.RotationInitializer(
        new Photons.RandomGenerator(0, 2.0 * Math.PI, -Math.PI, 0.0, 0.0, false)
    ));
    ps.addParticleStateInitializer(new Photons.RotationalSpeedInitializer(1.0, -1.0, 0.0, 0.0, false));

    ps.addParticleStateInitializer(new Photons.SizeInitializer(
        new Photons.RandomGenerator(
            THREE.Vector2,
            new THREE.Vector2(0.15, 0.15),
            new THREE.Vector2(0.0, 0.0),
            1.15 * scale, 0.60 * scale, false
        )
    ));

    ps.addParticleStateInitializer(new Photons.BoxPositionInitializer(
        new THREE.Vector3(0.05 * scale, 0.0, 0.05 * scale),
        new THREE.Vector3(-0.025 * scale, 0.0, -0.025 * scale)
    ));

    const vFactor = animSpeed * scale;
    ps.addParticleStateInitializer(new Photons.RandomVelocityInitializer(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1),
        2 * vFactor, 2 * vFactor
    ));

    ps.addParticleStateInitializer(new Photons.SequenceInitializer(sequences));
    ps.addParticleStateOperator(new Photons.SequenceOperator(sequences, 0.08 * animSpeed, false));

    const opacityOp = ps.addParticleStateOperator(new Photons.OpacityInterpolatorOperator());
    opacityOp.addElements([
        [0.0, 0.0],
        [0.5, 0.4],
        [0.2, 0.75],
        [0.0, 1.0]
    ]);

    const sizeOp = ps.addParticleStateOperator(new Photons.SizeInterpolatorOperator(true));
    sizeOp.addElementsFromParameters([
        [[0.6, 0.6], 0.0],
        [[1.0, 1.0], 0.4],
        [[1.0, 1.0], 1.0]
    ]);

    const colorOp = ps.addParticleStateOperator(new Photons.ColorInterpolatorOperator(true));
    colorOp.addElementsFromParameters([
        [[1.0, 1.0, 1.0], 0.0],
        [[1.5, 1.5, 1.5], 0.5],
        [[1.0, 1.0, 1.0], 1.0]
    ]);

    ps.setSimulateInWorldSpace(true);
    ps.setVisibile(false);
    ps.pause();
    return ps;
}

function setupBrightFlame(parent, threeRenderer, scale, releaseMultiplier, animSpeed) {
    const root = new THREE.Object3D();
    parent.add(root);

    const path = 'assets/textures/bright_flame.png';
    const atlas = getAtlas(path, 16, 212.0 / 1024.0, 256.0 / 1024.0);
    const psRenderer = new Photons.AnimatedSpriteRenderer(true, atlas, true, THREE.NormalBlending, true, renderSlot++);

    const ps = new Photons.ParticleSystem(root, psRenderer, threeRenderer);
    ps.init(20 * releaseMultiplier);
    ps.setEmitter(new Photons.ConstantParticleEmitter(BRIGHT_FLAME_RATE_BASE * releaseMultiplier));

    ps.addParticleSequence(0, 16);
    const sequences = ps.getParticleSequences();

    ps.addParticleStateInitializer(new Photons.LifetimeInitializer(0.0, 0.0, 0.0, 0.0, false));
    ps.addParticleStateInitializer(new Photons.RotationInitializer(
        new Photons.RandomGenerator(0, 2.0 * Math.PI, -Math.PI, 0.0, 0.0, false)
    ));
    ps.addParticleStateInitializer(new Photons.RotationalSpeedInitializer(Math.PI / 2.0, -Math.PI / 4.0, 0.0, 0.0, false));
    ps.addParticleStateInitializer(new Photons.SizeInitializer(
        new Photons.RandomGenerator(
            THREE.Vector2,
            new THREE.Vector2(0.05, 0.05),
            new THREE.Vector2(0.0, 0.0),
            0.95 * scale, 0.50 * scale, false
        )
    ));
    ps.addParticleStateInitializer(new Photons.BoxPositionInitializer(
        new THREE.Vector3(0.1 * scale, 0.0, 0.1 * scale),
        new THREE.Vector3(-0.05 * scale, 0.0, -0.05 * scale)
    ));

    const vFactor = animSpeed * scale;
    ps.addParticleStateInitializer(new Photons.RandomVelocityInitializer(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1),
        2 * vFactor, 2 * vFactor
    ));

    ps.addParticleStateInitializer(new Photons.SequenceInitializer(sequences));
    ps.addParticleStateOperator(new Photons.SequenceOperator(sequences, 0.1 * animSpeed, false));

    const opacityOp = ps.addParticleStateOperator(new Photons.OpacityInterpolatorOperator());
    opacityOp.addElements([
        [0.0, 0.0],
        [0.4, 0.2],
        [0.35, 0.75],
        [0.0, 1.0]
    ]);

    const sizeOp = ps.addParticleStateOperator(new Photons.SizeInterpolatorOperator(true));
    sizeOp.addElementsFromParameters([
        [[0.3, 0.3], 0.0],
        [[1.0, 1.0], 0.4],
        [[1.0, 1.0], 0.55],
        [[0.65, 0.65], 0.75],
        [[0.1, 0.1], 1.0]
    ]);

    const colorOp = ps.addParticleStateOperator(new Photons.ColorInterpolatorOperator(true));
    colorOp.addElementsFromParameters([
        [[1.0, 1.0, 1.0], 0.0],
        [[2.0, 2.0, 2.0], 0.3],
        [[2.0, 2.0, 2.0], 0.4],
        [[0.9, 0.6, 0.3], 0.65],
        [[0.75, 0.0, 0.0], 1.0]
    ]);

    ps.setSimulateInWorldSpace(true);
    ps.setVisibile(false);
    ps.pause();
    return ps;
}
