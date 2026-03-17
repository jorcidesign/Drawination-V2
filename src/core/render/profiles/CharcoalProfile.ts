// src/core/render/profiles/CharcoalProfile.ts
import type { IBrushProfile } from './IBrushProfile';

export const CharcoalProfile: IBrushProfile = {
    id: 'charcoal',
    name: 'Carboncillo',

    minSize: 25,
    maxSize: 120,
    baseSize: 28,

    baseOpacity: 1.0,         // Slider general de opacidad al 100%
    baseFlow: 1.0,            // Flujo de fusión (Rendering) al 100%
    blendMode: 'source-over',
    renderer: 'charcoal',

    spacing: 0.03,            // Espaciado al 7%
    angle: 0,
    aspectRatio: 0.33,        // Proporción 1:3 (palo de carbón)

    // === LÍMITES ESTILO PROCREATE ===
    // Tamaño por presión (28% a 49%)
    pressureSizeMin: 0.28,
    pressureSizeMax: 0.49,

    // Opacidad por presión (19% a 100%)
    pressureOpacityMin: 0.19,
    pressureOpacityMax: 1.0,

    // Flujo por presión (4% a 100%)
    pressureFlowMin: 0.04,
    pressureFlowMax: 1.0,

    // Retrocompatibilidad
    pressureSizeSensitivity: 0.0,
    pressureOpacitySensitivity: 0.0,

    smoothing: 0.3,

    physics: {
        charcoalAspect: 0.33,
        stabilizerWindow: 8,
        pressureCurve: {
            p1y: 0.333,       // Curva lineal natural
            p2y: 0.667
        }
    }
};