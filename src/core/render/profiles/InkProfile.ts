// src/core/render/profiles/InkProfile.ts
import type { IBrushProfile } from './IBrushProfile';

export const InkProfile: IBrushProfile = {
    id: 'ink-pen',
    name: 'Pluma de Tinta',

    minSize: 2.5,
    maxSize: 100,
    baseSize: 8,
    baseOpacity: 1.0,
    baseFlow: 0.9,           // Flujo base al 30% para acumulación de tinta
    blendMode: 'source-over',

    renderer: 'ink',
    textureType: 'solid',
    spacing: 0.02,
    angle: -45,
    aspectRatio: 0.25,

    // Retrocompatibilidad
    pressureSizeSensitivity: 0.0,
    pressureOpacitySensitivity: 0.0,

    // === LÍMITES ESTILO PROCREATE ===
    pressureSizeMin: 0.14,    // Tamaño mínimo: 14%
    pressureSizeMax: 0.84,    // Tamaño máximo: 84%

    pressureOpacityMin: 0.90, // Opacidad mínima al rozar: 30%
    pressureOpacityMax: 1.0,  // Opacidad al presionar: 100%

    // El flujo en la tinta suele ser constante, lo que varía es la opacidad y el tamaño
    pressureFlowMin: 1.0,     // Flujo se mantiene 1 a 1 respecto al baseFlow
    pressureFlowMax: 1.0,

    smoothing: 0.6,

    physics: {
        stabilizerWindow: 8,
        pressureCurve: {
            p1y: 0.1,         // Curva fuerte (cóncava) para requerir presión
            p2y: 0.5
        }
    }
};