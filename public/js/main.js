import * as THREE from 'three';
import { OrbitControls } from './OrbitControls.js';
import * as Photons from '../lib/photons.module.js';

const rootElement = document.querySelector('#root');

let camera;
let controls;
let scene;
let renderer;
let manager;

const SCALE = 0.18;
const RELEASE_MULTIPLIER = 70;
const ANIM_SPEED = 2.5;
let renderSlot = 1;

function init() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 200);
    camera.position.set(0, 2.2, 6.5);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05030a);
    scene.fog = new THREE.Fog(0x05030a, 14, 40);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rootElement.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.target.set(0, 1.0, -2.5);
    controls.minDistance = 2;
    controls.maxDistance = 20;

    window.addEventListener('resize', onResize, false);
}

function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}

function buildEnvironment() {
    scene.add(new THREE.AmbientLight(0x202838, 0.4));

    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(4, 6, 5);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0x6688ff, 0.3);
    fill.position.set(-5, 3, -2);
    scene.add(fill);

    const groundMat = new THREE.MeshStandardMaterial({
        color: 0x141014,
        roughness: 0.95
    });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 64), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    scene.add(ground);
}

function createFlameThrowerBody() {
    const root = new THREE.Object3D();

    const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x9a9aa0,
        roughness: 0.35,
        metalness: 0.85
    });

    const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 0.9, 24, 4),
        bodyMat
    );
    const t = new THREE.Matrix4();
    t.makeRotationX(Math.PI / 2);
    barrel.geometry.applyMatrix4(t);
    t.makeTranslation(0, 0, 0.45);
    barrel.geometry.applyMatrix4(t);
    root.add(barrel);

    const nozzle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.14, 0.18, 24),
        new THREE.MeshStandardMaterial({
            color: 0x2a1a14,
            roughness: 0.6,
            metalness: 0.7,
            emissive: 0xff4400,
            emissiveIntensity: 0.6
        })
    );
    nozzle.geometry.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    nozzle.position.set(0, 0, 0.05);
    root.add(nozzle);

    const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.35, 16),
        bodyMat
    );
    handle.position.set(0, -0.2, 0.7);
    root.add(handle);

    const particleSystemRoot = new THREE.Object3D();
    root.add(particleSystemRoot);

    return { root, particleSystemRoot };
}

function setupParticleSystems(particleSystemRoot) {
    manager = new Photons.Manager();
    manager.addParticleSystem(setupEmbers(particleSystemRoot));
    manager.addParticleSystem(setupBaseFlame(particleSystemRoot));
    manager.addParticleSystem(setupBrightFlame(particleSystemRoot));
}

function setupEmbers(parent) {
    const root = new THREE.Object3D();
    parent.add(root);

    const path = 'assets/textures/ember.png';
    const tex = new THREE.TextureLoader().load(path);
    const atlas = new Photons.Atlas(tex, path);
    atlas.addFrameSet(1, 0.0, 0.0, 1.0, 1.0);
    const psRenderer = new Photons.AnimatedSpriteRenderer(true, atlas, true, THREE.AdditiveBlending, true, renderSlot++);

    const ps = new Photons.ParticleSystem(root, psRenderer, renderer);
    ps.init(150 * RELEASE_MULTIPLIER);
    ps.setEmitter(new Photons.ConstantParticleEmitter(6 * RELEASE_MULTIPLIER));

    const sizeGen = new Photons.RandomGenerator(
        THREE.Vector2,
        new THREE.Vector2(0.0, 0.0),
        new THREE.Vector2(SCALE * 0.15, SCALE * 0.15),
        0.0, 0.0, false
    );
    ps.addParticleStateInitializer(new Photons.LifetimeInitializer(3.0 * ANIM_SPEED, 1.0 * ANIM_SPEED, 0.0, 0.0, false));
    ps.addParticleStateInitializer(new Photons.SizeInitializer(sizeGen));
    ps.addParticleStateInitializer(new Photons.BoxPositionInitializer(
        new THREE.Vector3(0.05 * SCALE, 0.0, 0.05 * SCALE),
        new THREE.Vector3(-0.025 * SCALE, 0.0, -0.025 * SCALE)
    ));

    const vFactor = ANIM_SPEED * SCALE;
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
        SCALE, SCALE, SCALE,
        0.0, 0.0, 0.0
    );
    ps.addParticleStateOperator(new Photons.AccelerationOperator(accelGen));

    ps.setSimulateInWorldSpace(true);
    ps.start();
    return ps;
}

function setupBaseFlame(parent) {
    const root = new THREE.Object3D();
    parent.add(root);

    const path = 'assets/textures/base_flame.png';
    const tex = new THREE.TextureLoader().load(path);
    const atlas = new Photons.Atlas(tex, path);
    atlas.addFrameSet(18, 0.0, 0.0, 128.0 / 1024.0, 128.0 / 512.0);
    const psRenderer = new Photons.AnimatedSpriteRenderer(true, atlas, true, THREE.NormalBlending, true, renderSlot++);

    const ps = new Photons.ParticleSystem(root, psRenderer, renderer);
    ps.init(50 * RELEASE_MULTIPLIER);
    ps.setEmitter(new Photons.ConstantParticleEmitter(10 * RELEASE_MULTIPLIER));

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
            1.15 * SCALE, 0.60 * SCALE, false
        )
    ));

    ps.addParticleStateInitializer(new Photons.BoxPositionInitializer(
        new THREE.Vector3(0.05 * SCALE, 0.0, 0.05 * SCALE),
        new THREE.Vector3(-0.025 * SCALE, 0.0, -0.025 * SCALE)
    ));

    const vFactor = ANIM_SPEED * SCALE;
    ps.addParticleStateInitializer(new Photons.RandomVelocityInitializer(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1),
        2 * vFactor, 2 * vFactor
    ));

    ps.addParticleStateInitializer(new Photons.SequenceInitializer(sequences));
    ps.addParticleStateOperator(new Photons.SequenceOperator(sequences, 0.08 * ANIM_SPEED, false));

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
    ps.start();
    return ps;
}

function setupBrightFlame(parent) {
    const root = new THREE.Object3D();
    parent.add(root);

    const path = 'assets/textures/bright_flame.png';
    const tex = new THREE.TextureLoader().load(path);
    const atlas = new Photons.Atlas(tex, path);
    atlas.addFrameSet(16, 0.0, 0.0, 212.0 / 1024.0, 256.0 / 1024.0);
    const psRenderer = new Photons.AnimatedSpriteRenderer(true, atlas, true, THREE.NormalBlending, true, renderSlot++);

    const ps = new Photons.ParticleSystem(root, psRenderer, renderer);
    ps.init(20 * RELEASE_MULTIPLIER);
    ps.setEmitter(new Photons.ConstantParticleEmitter(5 * RELEASE_MULTIPLIER));

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
            0.95 * SCALE, 0.50 * SCALE, false
        )
    ));
    ps.addParticleStateInitializer(new Photons.BoxPositionInitializer(
        new THREE.Vector3(0.1 * SCALE, 0.0, 0.1 * SCALE),
        new THREE.Vector3(-0.05 * SCALE, 0.0, -0.05 * SCALE)
    ));

    const vFactor = ANIM_SPEED * SCALE;
    ps.addParticleStateInitializer(new Photons.RandomVelocityInitializer(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1),
        2 * vFactor, 2 * vFactor
    ));

    ps.addParticleStateInitializer(new Photons.SequenceInitializer(sequences));
    ps.addParticleStateOperator(new Photons.SequenceOperator(sequences, 0.1 * ANIM_SPEED, false));

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
    ps.start();
    return ps;
}

function addJetLights(jetParent) {
    const lights = [];
    for (let i = 0; i < 3; i++) {
        const l = new THREE.PointLight(0xff7733, 4.0, 8.0, 2.0);
        l.position.set(0, 0, -1.0 - i * 1.2);
        jetParent.add(l);
        lights.push(l);
    }
    return lights;
}

let jetLights;

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    manager.update();

    if (jetLights) {
        const t = performance.now() * 0.01;
        for (let i = 0; i < jetLights.length; i++) {
            jetLights[i].intensity = 3.0 + Math.sin(t + i * 1.7) * 1.5 + Math.random() * 0.6;
        }
    }

    renderer.render(scene, camera);
    manager.render(renderer, camera);
}

function start() {
    init();
    buildEnvironment();

    const { root, particleSystemRoot } = createFlameThrowerBody();
    root.position.set(0, 1.4, 1.5);
    scene.add(root);

    setupParticleSystems(particleSystemRoot);
    jetLights = addJetLights(particleSystemRoot);

    animate();
}

start();
