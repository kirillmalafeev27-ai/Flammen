import * as THREE from 'three';
import { Game } from './game.js';

const rootElement = document.querySelector('#root');

const renderWidth = () => Math.floor(window.innerWidth);
const renderHeight = () => Math.floor(window.innerHeight);

const camera = new THREE.PerspectiveCamera(54, renderWidth() / renderHeight(), 0.1, 500);
camera.position.set(0, 6, 8);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070403);
scene.fog = new THREE.Fog(0x070403, 26, 78);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(renderWidth(), renderHeight());
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
rootElement.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0x3d3128, 0.5));
const moon = new THREE.DirectionalLight(0xc0a176, 0.7);
moon.position.set(20, 30, 10);
scene.add(moon);
const fill = new THREE.DirectionalLight(0x5a3024, 0.28);
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
            won: ['THE WAY OPENS', '#ffcc77'],
            wrong_door: ['FALSE DOOR', '#e25d45'],
            burned: ['TAKEN BY FIRE', '#ff7a2f']
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
        this.hud.innerHTML =
            `<div>Bridge <b>${game.playerBridge + 1} / ${game.bridges.length}</b> - ${phase}</div>` +
            `<div class="dim">${tile === tiles - 1 ? 'Press E or Space to enter' : 'W / Up forward - S / Down back - A / D switch at perimeter'}</div>`;
    }
};

const game = new Game(scene, camera, renderer, ui);

function animate() {
    requestAnimationFrame(animate);
    game.update();
    game.render();
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
