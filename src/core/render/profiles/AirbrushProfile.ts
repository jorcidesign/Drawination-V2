// src/core/render/profiles/AirbrushProfile.ts
import type { IBrushProfile } from './IBrushProfile';

export const AirbrushProfile: IBrushProfile = {
    id: 'airbrush',
    name: 'Aerógrafo',

    minSize: 60,
    maxSize: 160,
    baseSize: 80,

    baseOpacity: 1.0,         // Máximo del slider
    baseFlow: 0.60,           // Flujo de fusión al 60%
    blendMode: 'source-over',

    renderer: 'airbrush',

    spacing: 0.20,            // Espaciado al 20%
    angle: 0,
    aspectRatio: 1.0,         // Circular perfecto

    // === LÍMITES ESTILO PROCREATE (APPLE PENCIL) ===

    // Tamaño por presión: 0% (se mantiene constante en 1.0)
    pressureSizeMin: 1.0,
    pressureSizeMax: 1.0,

    // Opacidad por presión: 0% (se mantiene constante en 1.0)
    pressureOpacityMin: 1.0,
    pressureOpacityMax: 1.0,

    // Flujo por presión: Va de 0% a 100%
    pressureFlowMin: 0.0,
    pressureFlowMax: 1.0,

    // Compatibilidad vieja a cero
    pressureSizeSensitivity: 0.0,
    pressureOpacitySensitivity: 0.0,
    smoothing: 0.3,

    physics: {
        stabilizerWindow: 8,
        pressureCurve: {
            // Curva base lineal, los límites de 24% y 79% que 
            // mencionas dictan este comportamiento en el motor
            p1y: 0.333,
            p2y: 0.667
        }
    }
};