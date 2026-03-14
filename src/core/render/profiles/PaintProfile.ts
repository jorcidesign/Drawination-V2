// src/core/render/profiles/PaintProfile.ts
import type { IBrushProfile } from './IBrushProfile';

export const PaintProfile: IBrushProfile = {
    id: 'oil-brush',
    name: 'Pincel de Óleo',
    minSize: 4,
    maxSize: 120,
    baseSize: 35,
    baseOpacity: 0.8,
    blendMode: 'source-over',

    renderer: 'paint',

    // 0.08 → sweet spot entre 0.05 (lag) y 0.1 (punteado visible en curvas lentas)
    spacing: 0.08,
    angle: 0,
    aspectRatio: 1.0,
    pressureSizeSensitivity: 0.1,
    pressureOpacitySensitivity: 0.5,
    smoothing: 0.3,

    physics: {
        // 30 cerdas: con batching el costo GPU es ~5 flushes sin importar el count
        bristleCount: 30,
        depletionRate: 0.003,
        saturationK: 0.15,
        separationFactor: 0.2,
        velocityK: 0.3,
        grainFrequency: 0.12,
    }


};