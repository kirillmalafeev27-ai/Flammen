import * as THREE from 'three';
import { OrbitControls } from './OrbitControls.js';
import * as Photons from '../lib/photons.module.js';

const rootElement = document.querySelector('#root');

let camera;
let controls;
let scene;
let renderer;
let manager;
let clock;

const FLAME_POSITION = new THREE.Vector3(0, 1.2, 0);
const FLAME_SCALE = 0.28;

function initThreeJS() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 200);
    camera.position.set(2.6, 2.0, 3.2);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05030a);
    scene.fog = new THREE.Fog(0x05030a, 8, 28);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rootElement.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.maxPolarAngle = (0.95 * Math.PI) / 2;
    controls.minDistance = 1.5;
    controls.maxDistance = 12;
    controls.target.set(0, 1.3, 0);

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
    const ambient = new THREE.AmbientLight(0x402030, 0.35);
    scene.add(ambient);

    const moon = new THREE.DirectionalLight(0x6a7ab5, 0.25);
    moon.position.set(-6, 8, -4);
    scene.add(moon);

    const groundGeo = new THREE.CircleGeometry(24, 64);
    const groundMat = new THREE.MeshStandardMaterial({
        color: 0x1a1410,
        roughness: 0.95,
        metalness: 0.0
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const pedestalGroup = new THREE.Group();
    scene.add(pedestalGroup);

    const baseMat = new THREE.MeshStandardMaterial({
        color: 0x2b2520,
        roughness: 0.85,
        metalness: 0.1
    });

    const pedestalBase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.75, 0.15, 24),
        baseMat
    );
    pedestalBase.position.y = 0.075;
    pedestalBase.castShadow = true;
    pedestalBase.receiveShadow = true;
    pedestalGroup.add(pedestalBase);

    const pedestalColumn = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.42, 0.95, 18),
        baseMat
    );
    pedestalColumn.position.y = 0.15 + 0.95 / 2;
    pedestalColumn.castShadow = true;
    pedestalColumn.receiveShadow = true;
    pedestalGroup.add(pedestalColumn);

    const bowlMat = new THREE.MeshStandardMaterial({
        color: 0x3a2a1a,
        roughness: 0.7,
        metalness: 0.25,
        emissive: 0x331100,
        emissiveIntensity: 0.4
    });
    const bowl = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.32, 0.18, 24),
        bowlMat
    );
    bowl.position.y = 0.15 + 0.95 + 0.09;
    bowl.castShadow = true;
    bowl.receiveShadow = true;
    pedestalGroup.add(bowl);

    const coalMat = new THREE.MeshStandardMaterial({
        color: 0x110806,
        roughness: 0.95,
        emissive: 0xff3300,
        emissiveIntensity: 1.2
    });
    const coals = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.28, 0.05, 24),
        coalMat
    );
    coals.position.y = 0.15 + 0.95 + 0.18 + 0.025;
    pedestalGroup.add(coals);
}

function setupParticleSystems() {
    manager = new Photons.Manager();

    manager.addParticleSystem(setupEmbers(FLAME_SCALE, FLAME_POSITION));
    manager.addParticleSystem(setupBaseFlame(FLAME_SCALE, FLAME_POSITION));
    manager.addParticleSystem(setupBrightFlame(FLAME_SCALE, FLAME_POSITION));

    const lightParent = new THREE.Object3D();
    scene.add(lightParent);
    lightParent.position.copy(FLAME_POSITION);
    lightParent.position.y += 0.15;

    const flickerShadows = {
        mapSize: 1024,
        cameraNear: 0.5,
        cameraFar: 50,
        bias: 0.000009,
        edgeRadius: 3
    };
    manager.addComponent(
        new Photons.FlickerLight(
            lightParent,
            8,
            2.2,
            new THREE.Color().setRGB(1, 0.75, 0.35),
            0,
            1.0,
            flickerShadows
        )
    );
}

function setupEmbers(scale, position) {
    const root = new THREE.Object3D();
    root.position.copy(position);

    const path = 'assets/textures/ember.png';
    const tex = new THREE.TextureLoader().load(path);
    const atlas = new Photons.Atlas(tex, path);
    atlas.addFrameSet(1, 0.0, 0.0, 1.0, 1.0);
    const psRenderer = new Photons.AnimatedSpriteRenderer(true, atlas, true, THREE.AdditiveBlending);

    const ps = new Photons.ParticleSystem(root, psRenderer, renderer);
    ps.init(180);
    ps.setEmitter(new Photons.ConstantParticleEmitter(8));

    const sizeGen = new Photons.RandomGenerator(
        THREE.Vector2,
        new THREE.Vector2(0.0, 0.0),
        new THREE.Vector2(scale * 0.15, scale * 0.15),
        0.0, 0.0, false
    );
    ps.addParticleStateInitializer(new Photons.LifetimeInitializer(3.0, 1.0, 0.0, 0.0, false));
    ps.addParticleStateInitializer(new Photons.SizeInitializer(sizeGen));
    ps.addParticleStateInitializer(new Photons.BoxPositionInitializer(
        new THREE.Vector3(0.05 * scale, 0.0, 0.05 * scale),
        new THREE.Vector3(-0.025 * scale, 0.0, -0.025 * scale)
    ));
    ps.addParticleStateInitializer(new Photons.RandomVelocityInitializer(
        new THREE.Vector3(0.4 * scale, 0.5 * scale, 0.4 * scale),
        new THREE.Vector3(-0.2 * scale, 0.8 * scale, -0.2 * scale),
        0.6 * scale, 0.8 * scale, false
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
        -Math.PI / 2, 20.0, -8,
        scale, scale, scale,
        0.0, 0.0, 0.0
    );
    ps.addParticleStateOperator(new Photons.AccelerationOperator(accelGen));

    ps.setSimulateInWorldSpace(true);
    ps.start();
    return ps;
}

function setupBaseFlame(scale, position) {
    const root = new THREE.Object3D();
    root.position.copy(position);

    const path = 'assets/textures/base_flame.png';
    const tex = new THREE.TextureLoader().load(path);
    const atlas = new Photons.Atlas(tex, path);
    atlas.addFrameSet(18, 0.0, 0.0, 128.0 / 1024.0, 128.0 / 512.0);
    const psRenderer = new Photons.AnimatedSpriteRenderer(true, atlas, true);

    const ps = new Photons.ParticleSystem(root, psRenderer, renderer);
    ps.init(50);
    ps.setEmitter(new Photons.ConstantParticleEmitter(10));

    ps.addParticleSequence(0, 18);
    const sequences = ps.getParticleSequences();

    ps.addParticleStateInitializer(new Photons.LifetimeInitializer(0.0, 0.0, 0.0, 0.0, false));
    ps.addParticleStateInitializer(new Photons.RotationInitializer(
        new Photons.RandomGenerator(0, Math.PI / 2.0, -Math.PI / 2.0, 0.0, 0.0, false)
    ));
    ps.addParticleStateInitializer(new Photons.RotationalSpeedInitializer(1.0, -1.0, 0.0, 0.0, false));
    ps.addParticleStateInitializer(new Photons.SizeInitializer(
        new Photons.RandomGenerator(
            THREE.Vector2,
            new THREE.Vector2(0.25 * scale, 0.25 * scale),
            new THREE.Vector2(0.5 * scale, 0.5 * scale),
            0.0, 0.0, false
        )
    ));
    ps.addParticleStateInitializer(new Photons.BoxPositionInitializer(
        new THREE.Vector3(0.05 * scale, 0.0, 0.05 * scale),
        new THREE.Vector3(-0.025 * scale, 0.0, -0.025 * scale)
    ));
    ps.addParticleStateInitializer(new Photons.RandomVelocityInitializer(
        new THREE.Vector3(0.05 * scale, 0.4 * scale, 0.05 * scale),
        new THREE.Vector3(-0.025 * scale, 0.8 * scale, -0.025 * scale),
        0.35 * scale, 0.5 * scale, false
    ));
    ps.addParticleStateInitializer(new Photons.SequenceInitializer(sequences));

    ps.addParticleStateOperator(new Photons.SequenceOperator(sequences, 0.07, false));

    const opacityOp = ps.addParticleStateOperator(new Photons.OpacityInterpolatorOperator());
    opacityOp.addElements([
        [0.0, 0.0],
        [0.3, 0.25],
        [0.3, 0.5],
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

    ps.addParticleStateOperator(new Photons.AccelerationOperator(
        new Photons.RandomGenerator(
            THREE.Vector3,
            new THREE.Vector3(0.0, 0.0, 0.0),
            new THREE.Vector3(0.0, 1.5 * scale, 0.0),
            0.0, 0.0, false
        )
    ));

    ps.setSimulateInWorldSpace(true);
    ps.start();
    return ps;
}

function setupBrightFlame(scale, position) {
    const root = new THREE.Object3D();
    root.position.copy(position);

    const path = 'assets/textures/bright_flame.png';
    const tex = new THREE.TextureLoader().load(path);
    const atlas = new Photons.Atlas(tex, path);
    atlas.addFrameSet(16, 0.0, 0.0, 212.0 / 1024.0, 256.0 / 1024.0);
    const psRenderer = new Photons.AnimatedSpriteRenderer(true, atlas, true);

    const ps = new Photons.ParticleSystem(root, psRenderer, renderer);
    ps.init(20);
    ps.setEmitter(new Photons.ConstantParticleEmitter(5));

    ps.addParticleSequence(0, 16);
    const sequences = ps.getParticleSequences();

    ps.addParticleStateInitializer(new Photons.LifetimeInitializer(0.0, 0.0, 0.0, 0.0, false));
    ps.addParticleStateInitializer(new Photons.RotationInitializer(
        new Photons.RandomGenerator(0, Math.PI, -Math.PI / 2.0, 0.0, 0.0, false)
    ));
    ps.addParticleStateInitializer(new Photons.RotationalSpeedInitializer(Math.PI / 2.0, -Math.PI / 4.0, 0.0, 0.0, false));
    ps.addParticleStateInitializer(new Photons.SizeInitializer(
        new Photons.RandomGenerator(
            THREE.Vector2,
            new THREE.Vector2(0.0, 0.0),
            new THREE.Vector2(0.0, 0.0),
            0.2 * scale, 0.65 * scale, false
        )
    ));
    ps.addParticleStateInitializer(new Photons.BoxPositionInitializer(
        new THREE.Vector3(0.1 * scale, 0.0, 0.1 * scale),
        new THREE.Vector3(-0.05 * scale, 0.0, -0.05 * scale)
    ));
    ps.addParticleStateInitializer(new Photons.RandomVelocityInitializer(
        new THREE.Vector3(0.02 * scale, 0.4 * scale, 0.02 * scale),
        new THREE.Vector3(-0.01 * scale, 0.4 * scale, -0.01 * scale),
        0.1 * scale, 0.2 * scale, false
    ));
    ps.addParticleStateInitializer(new Photons.SequenceInitializer(sequences));

    ps.addParticleStateOperator(new Photons.SequenceOperator(sequences, 0.1, false));

    const opacityOp = ps.addParticleStateOperator(new Photons.OpacityInterpolatorOperator());
    opacityOp.addElements([
        [0.0, 0.0],
        [0.6, 0.2],
        [0.5, 0.75],
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

    ps.addParticleStateOperator(new Photons.AccelerationOperator(
        new Photons.RandomGenerator(
            THREE.Vector3,
            new THREE.Vector3(0.0, 0.0, 0.0),
            new THREE.Vector3(0.0, 1.5 * scale, 0.0),
            0.0, 0.0, false
        )
    ));

    ps.setSimulateInWorldSpace(true);
    ps.start();
    return ps;
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    manager.update();
    renderer.render(scene, camera);
    manager.render(renderer, camera);
}

function start() {
    initThreeJS();
    buildEnvironment();
    setupParticleSystems();
    clock = new THREE.Clock();
    animate();
}

start();
