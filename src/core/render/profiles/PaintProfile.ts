// src/core/render/profiles/PaintProfile.ts
import type { IBrushProfile } from './IBrushProfile';

export const PaintProfile: IBrushProfile = {
    id: 'oil-brush',
    name: 'Pincel de Óleo',

    minSize: 4,
    maxSize: 120,
    baseSize: 35,

    baseOpacity: 1.0,         // Máximo general
    baseFlow: 0.95,           // Flujo de fusión (Rendering) al 95%
    blendMode: 'source-over',

    renderer: 'paint',

    spacing: 0.02,            // Espaciado ultra cerrado al 2%
    angle: 0,
    aspectRatio: 1.0,

    // === LÍMITES ESTILO PROCREATE ===
    // Tamaño por presión (60% a 63%) - Las cerdas no se encogen mucho
    pressureSizeMin: 0.60,
    pressureSizeMax: 0.63,

    // Opacidad por presión (0% a 100%)
    pressureOpacityMin: 0.0,
    pressureOpacityMax: 1.0,

    // Flujo por presión (8% a 24%) - Liberación de pintura orgánica
    pressureFlowMin: 0.08,
    pressureFlowMax: 0.24,

    // Retrocompatibilidad a 0
    pressureSizeSensitivity: 0.0,
    pressureOpacitySensitivity: 0.0,

    smoothing: 0.3,

    physics: {
        bristleCount: 30,
        depletionRate: 0.003,
        saturationK: 0.15,
        separationFactor: 0.2,
        velocityK: 0.3,
        grainFrequency: 0.12,
        stabilizerWindow: 8,
        pressureCurve: {
            p1y: 0.25,        // Curva suave (cóncava intermedia)
            p2y: 0.65
        }
    }
};