// src/core/render/profiles/PencilProfiles.ts
import type { IBrushProfile } from './IBrushProfile';

export const PencilProfile: IBrushProfile = {
    id: 'pencil-hb',
    name: 'Lápiz HB',

    minSize: 8,
    maxSize: 80,
    baseSize: 14,

    baseOpacity: 0.8,
    baseFlow: 0.88,
    blendMode: 'source-over',

    renderer: 'basic',
    textureType: 'pencil-grain',

    spacing: 0.11,
    angle: 0,
    aspectRatio: 1.0,

    // === LA FÍSICA DEL GRAFITO REAL ===
    // 1. El tamaño casi no cambia. Un lápiz físico no se encoge al 11%.
    // Lo dejamos en 85% para que solo simule la diferencia entre la punta afilada y el borde.
    pressureSizeMin: 0.85,
    pressureSizeMax: 1.0,

    // 2. La Opacidad toma el control absoluto.
    // A presión cero, apenas deja un rastro fantasma (5%). Al presionar, llega al 100%.
    pressureOpacityMin: 0.05,
    pressureOpacityMax: 1.0,

    // 3. El Flujo acompaña a la opacidad para que no sature rápido.
    // Presionar suave suelta muy poco polvo de grafito.
    pressureFlowMin: 0.10,
    pressureFlowMax: 1.0,

    smoothing: 0.2,

    physics: {
        stabilizerWindow: 8,
        pressureCurve: {
            p1y: 0.333, // Diagonal perfecta, respuesta predecible y lineal
            p2y: 0.667
        }
    },

    // Retrocompatibilidad
    pressureSizeSensitivity: 0,
    pressureOpacitySensitivity: 0
};