// src/core/render/profiles/HardRoundProfile.ts
import type { IBrushProfile } from './IBrushProfile';

export const HardRoundProfile: IBrushProfile = {
    id: 'hard-round',
    name: 'Pincel Duro Redondo',

    minSize: 1,
    maxSize: 120,
    baseSize: 80,
    baseOpacity: 1.0,
    baseFlow: 1.0,            // Flujo maestro al 100%

    blendMode: 'source-over',
    renderer: 'hard-round',

    spacing: 0.03,            // 13% exacto
    angle: 0,
    aspectRatio: 1.0,

    pressureSizeSensitivity: 0.0,
    pressureOpacitySensitivity: 0.0,

    // === LA MAGIA DEL TACTO SUAVE ===
    pressureFlowMin: 0.0,     // A presión mínima: 0% de flujo (ultra suave)
    pressureFlowMax: 0.60,    // A presión máxima: 60% de flujo 

    smoothing: 0.08,          // Streamline 8%

    physics: {
        stabilizerWindow: 2,
        pressureCurve: {
            p1y: 0.333,       // Curva diagonal recta perfecta (lineal)
            p2y: 0.667
        }
    }
};