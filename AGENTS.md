# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

- `npm install` — install Express (the only runtime dependency)
- `npm start` — launch the static server on `http://localhost:3000`

There are no tests, linter, or build step. The browser loads `public/` directly via native ES modules; edit-and-refresh is the dev loop.

## Architecture

Three.js + Photons2 browser game served by a thin Express static host. All game code is vanilla ES modules under `public/`; no bundler.

### Module layout
- `server.js` — Express static server. Forces `application/javascript` MIME on `.js`/`.mjs` so the browser accepts the bare-import map.
- `public/index.html` — entry point. Defines the import map (`"three" -> "./lib/three.module.js"`) and the intro/HUD/overlay DOM. The `#intro` overlay is **visible by default** in CSS.
- `public/js/main.js` — bootstraps THREE renderer/scene/camera/lights, builds the `Game`, runs the `requestAnimationFrame` loop. Wraps `game.build()` in a try/catch that rewrites `#intro` into a "Failed to load" message on error.
- `public/js/game.js` — all game logic in one `Game` class. See "Game flow" below.
- `public/js/flamethrower.js` — `buildFlamethrower(parent, renderer, opts)` returns a 3-system Photons2 jet (`embers` + `baseFlame` + `brightFlame`) with `setFiring(on)` toggling emission rates between 0 and `baseRate * releaseMultiplier`. `renderSlot` is a module-level counter that hands each subsystem a unique render order — order matters for additive/normal blending.
- `public/js/GltfLoader.js` — vendored three.js r155 GLTFLoader (the bundled three.module.js doesn't ship it).
- `public/lib/photons.module.js`, `three.module.js`, `fflate.module.js`, `meshopt_decoder.module.js` — vendored libs. **All assets in `public/assets/*.glb` are encoded with `EXT_meshopt_compression`**, so any GLTFLoader instance must be configured with `loader.setMeshoptDecoder(MeshoptDecoder)` before `loadAsync` or it will throw.

### Game flow (`game.js`)
1. `new Game(...)` only stores refs and inits empty arrays. **Do not call `bindInput()` here** — assets aren't loaded yet, and the intro overlay is already visible, so an early Enter would call `startRun()` before `spawnPlayer()`.
2. `game.build()` (awaited from `main.js`) runs in order: `loadAssets()` → `layoutWorld()` → `spawnPlayer()` → `placeStatuesAndDoors()` → `randomizeCorrectDoors()` → `bindInput()` → `ui.showIntro()`. Input must be bound last.
3. `loadAssets()` loads `temple.glb` and `moai.glb` in parallel and computes `moaiTemplateScale` from the moai bounding box so all clones land at `cfg.moaiHeight` world units tall, regardless of source authoring scale.
4. `layoutWorld()` computes the play radius and bridge-plane Y from the temple's bounding box. The defaults assume the temple's interior floor is at `box.min.y` — if the model has a recessed/raised floor, override via the `?y=…` URL param.
5. `placeStatuesAndDoors()` builds **two** moai per bridge (outer at tile 1, inner at tile `tiles-2`), each with its own flamethrower whose phase is offset by `FIRE_PERIOD/2`, plus decorative moai between bridges (no particle systems).

### Per-frame update (`Game.update`)
- Move tween (`moveAnim`, easing + sin-arc hop on Y).
- `updateStatues(dt)` — culls flames by squared distance (≤ 144 = 12 units). Beyond that range, `setFiring(false)` and `eyeLight.intensity = 0`. Within range, the statue's phase determines warning glow / firing / decay.
- `checkBurn()` — burns the player if standing on the statue's tile **and** `isFireActive` for that statue. Only outer/inner statues are danger tiles (tiles 1 and `tiles-2`).
- `updateCamera(dt)` — third-person, exponential lerp toward `playerPos + radialOutward * 5 + (0,4.5,0)`, looking at `playerPos + (0,0.8,0)`.
- `manager.update()` then `manager.render(renderer, camera)` after `renderer.render(...)` — Photons2's manager owns particle simulation/rendering.

### Performance contract
The README documents the 60fps strategy: 16 pre-allocated flame systems but only the ~2-4 closest active at once via the 12-unit gate; pixel ratio capped at 1.5; no shadow maps; ACES tonemapping. **Do not** add per-frame allocations in `update()` — reuse vectors. Don't add shadow maps or raise pixel ratio without a perf reason.

### Tuning knobs
All geometry/visual tuning lives in the `cfg` object at the top of `game.js`, populated from URL params. The set is documented in `README.md` ("URL-параметры") — the important ones are `?y=` (bridge plane height), `?rInner` / `?rOuter` (ring radii), `?moaiH=` (statue height), `?fireScale=` and `?release=`. When the temple model changes, retune via URL params first; only edit the defaults if every run needs them.

## Deployment

`render.yaml` is a Render Blueprint (free Node web service). Production runs `npm install && npm start`; no other build step.
