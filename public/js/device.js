// Single source of truth for device/GPU capability detection.
//
// Both the renderer bootstrap (main.js) and the game tuning (game.js) read the
// profile from here so the two never drift apart. The important job is to catch
// weak/old Macs: older Intel-GPU MacBooks/minis (and any Mac on a Safari without
// WebGL2) used to fall through every "is this mobile?" check and got the full
// desktop profile — releaseMul 20, antialias, highp, no statue culling — which
// either lagged badly or exhausted GPU memory and lost the WebGL context
// (surfacing as "Failed to load"). They now get the same lightweight profile as
// phones. Add `?quality=high` to force full quality, `?quality=low` to force the
// lightweight profile.

const params = new URLSearchParams(location.search);
const qualityParam = params.get('quality') || 'auto';

// Throwaway probe context. We mirror the real renderer's `high-performance`
// preference so dual-GPU Macs report the discrete GPU (AMD/Nvidia) they will
// actually render with, not their idle integrated Intel chip.
function probeGpu() {
    try {
        const canvas = document.createElement('canvas');
        const attrs = { powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false };
        const gl2 = canvas.getContext('webgl2', attrs);
        const gl = gl2 || canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
        if (!gl) return { hasWebGL2: false, renderer: '' };

        let renderer = '';
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
        if (!renderer) renderer = gl.getParameter(gl.RENDERER) || '';

        const loseContext = gl.getExtension('WEBGL_lose_context');
        if (loseContext) loseContext.loseContext();

        return { hasWebGL2: Boolean(gl2), renderer: String(renderer) };
    } catch (error) {
        return { hasWebGL2: false, renderer: '' };
    }
}

const ua = navigator.userAgent;
const isMac = navigator.platform === 'MacIntel' || /Macintosh/.test(ua);
// iPadOS 13+ reports itself as a desktop Mac; touch points give it away.
const isTouchMac = isMac && navigator.maxTouchPoints > 1;

const isMobileAgent =
    /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ||
    (Boolean(window.matchMedia?.('(pointer: coarse)').matches) && navigator.maxTouchPoints > 1);

const gpu = probeGpu();
// Integrated/software renderers that struggle with the particle load.
const weakGpuPattern = /(intel|swiftshader|llvmpipe|software|microsoft basic|apple software|mesa)/i;
// A "weak Mac" is a real (non-iPad) Mac that either lacks WebGL2 (old macOS /
// Safari < 15) or runs on integrated/Intel graphics. Macs with a discrete GPU
// keep the full-quality desktop profile.
const weakMac = isMac && !isTouchMac && (!gpu.hasWebGL2 || weakGpuPattern.test(gpu.renderer));

export const iosRuntime = qualityParam !== 'high' &&
    (/iPhone|iPad|iPod/i.test(ua) || isTouchMac);

// Drives touch-only UI (on-screen controls). Stays tied to real touch/mobile so
// a weak desktop Mac does not sprout phone controls.
export const mobileRuntime = qualityParam !== 'high' &&
    (qualityParam === 'low' || isMobileAgent);

// Drives every performance trade-off: pixel ratio, antialias, shader precision,
// particle budget and statue culling.
export const lowPower =
    qualityParam === 'low' ? true :
    qualityParam === 'high' ? false :
    Boolean(isMobileAgent || weakMac);

export const profile = {
    quality: qualityParam,
    isMac,
    isIos: iosRuntime,
    mobileRuntime,
    lowPower,
    weakMac,
    hasWebGL2: gpu.hasWebGL2,
    gpuRenderer: gpu.renderer,
    // Retina weak Macs render 4x the fragments at native ratio; 1.0 halves that
    // while staying readable. Phones go lower still.
    pixelRatioCap: qualityParam === 'high' ? 1.5 :
        iosRuntime ? 0.6 :
        mobileRuntime ? 0.7 :
        weakMac ? 1.0 :
        1.5,
    antialias: !lowPower,
    precision: lowPower ? 'mediump' : 'highp',
    powerPreference: lowPower ? 'default' : 'high-performance',
    // Photons release multiplier: caps pre-allocated particle buffers per jet.
    releaseMultiplier: lowPower ? (iosRuntime ? 2.5 : 3) : 20,
    // Beyond this squared distance a statue's flame/light is fully culled.
    statueCullRadiusSq: lowPower ? 196 : Infinity,
    textureAnisotropy: lowPower ? 1 : 4
};
