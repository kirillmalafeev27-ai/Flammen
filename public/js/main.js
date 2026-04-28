import * as THREE from 'three';
import { Game } from './game.js';

const rootElement = document.querySelector('#root');

const renderWidth = () => Math.floor(window.innerWidth);
const renderHeight = () => Math.floor(window.innerHeight);

const camera = new THREE.PerspectiveCamera(60, renderWidth() / renderHeight(), 0.1, 500);
camera.position.set(20, 18, 20);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07050b);
scene.fog = new THREE.Fog(0x07050b, 30, 90);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
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

const ui = {
    intro: document.querySelector('#intro'),
    overlay: document.querySelector('#overlay'),
    hud: document.querySelector('#hud'),
    showIntro() { this.intro.style.display = 'flex'; },
    hideIntro() { this.intro.style.display = 'none'; },
    hideOverlay() { this.overlay.style.display = 'none'; },
    showOutcome(state) {
        const titles = {
            won: ['YOU FOUND THE WAY', '#ffcc44'],
            wrong_door: ['THE DOOR IS A LIE', '#ff5555'],
            burned: ['SCORCHED', '#ff7733']
        };
        const [t, c] = titles[state] || ['-', '#ffffff'];
        this.overlay.innerHTML =
            `<div class="outcome" style="color:${c}">${t}</div>` +
            `<div class="hint">Press <b>R</b> or <b>Enter</b> to try again</div>`;
        this.overlay.style.display = 'flex';
    },
    update(game) {
        const tile = game.playerTile;
        const tiles = game.bridges[0].tiles.length;
        const phase = tile === 0 ? 'PERIMETER' :
                      tile === tiles - 1 ? 'AT THE DOOR' :
                      `TILE ${tile} / ${tiles - 1}`;
        const hint = tile === tiles - 1 ?
            'Press E or Space to enter' :
            'Mouse drag to look - Arrows/WASD move by view';
        this.hud.innerHTML =
            `<div>Bridge <b>${game.playerBridge + 1} / ${game.bridges.length}</b> - ${phase}</div>` +
            `<div class="dim">${hint}</div>`;
    }
};

const game = new Game(scene, camera, renderer, ui);

let stats = { frames: 0, t0: performance.now() };
function tickFps() {
    stats.frames++;
    const now = performance.now();
    if (now - stats.t0 > 1000) {
        const fps = (stats.frames * 1000 / (now - stats.t0)).toFixed(0);
        document.querySelector('#fps').textContent = `${fps} fps`;
        stats.frames = 0;
        stats.t0 = now;
    }
}

function animate() {
    requestAnimationFrame(animate);
    game.update();
    game.render();
    tickFps();
}

(async () => {
    try {
        await game.build();
        animate();
    } catch (e) {
        console.error(e);
        document.querySelector('#intro').innerHTML =
            `<div class="outcome" style="color:#ff5555">Failed to load</div>` +
            `<div class="hint">${e.message}</div>`;
    }
})();
