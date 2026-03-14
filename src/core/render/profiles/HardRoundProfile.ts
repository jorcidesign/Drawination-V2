// src/core/render/profiles/HardRoundProfile.ts
import type { IBrushProfile } from './IBrushProfile';

export const HardRoundProfile: IBrushProfile = {
    id: 'hard-round',
    name: 'Pincel Duro Redondo',

    minSize: 60,
    maxSize: 120,
    baseSize: 80,
    baseOpacity: 0.60,         // Límite máximo de opacidad por trazo
    blendMode: 'source-over',

    renderer: 'hard-round',   // Activa la nueva estrategia matemática

    spacing: 0.08,            // Muy junto para que el borde sea continuo
    angle: 0,
    aspectRatio: 1.0,         // Círculo perfecto

    // Estos se ignoran en favor de la curva Bezier de la física,
    // pero los mantenemos en 0 para compatibilidad de interfaz.
    pressureSizeSensitivity: 0.0,
    pressureOpacitySensitivity: 0.0,
    smoothing: 0.0,

    physics: {
        flow: 0.4,                  // Depósito por stamp
        stabilizerWindow: 8,        // Elimina el temblor de la tableta
        pressureCurve: {            // Zona muerta al inicio, saturación suave al final
            p1y: 0.05,
            p2y: 0.7
        }
    }
};