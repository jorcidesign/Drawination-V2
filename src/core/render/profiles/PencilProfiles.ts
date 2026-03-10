// src/core/render/profiles/PencilProfile.ts
import type { IBrushProfile } from './IBrushProfile';

export const PencilProfile: IBrushProfile = {
    id: 'pencil-hb',
    name: 'Lápiz HB',

    baseSize: 15,          // Un poco más grande para ver bien la textura
    baseOpacity: 0.16666666666666666,      // Semitransparente para que la acumulación oscurezca
    blendMode: 'source-over',

    textureType: 'pencil-grain',
    spacing: 0.111222333333,          // ¡CLAVE! Estampa un sello cada 10% de avance

    // Geometría del Lápiz (Punta redonda)
    angle: 0,
    aspectRatio: 1.0,
    renderMode: 'stroke',
    // Antes estaba en 0.3
    pressureSizeSensitivity: 0.02,   // Casi imperceptible, solo simula el micro-aplastamiento de la punta
    pressureOpacitySensitivity: 0.8, // Todo el esfuerzo se va en oscurecer el trazo
    smoothing: 0.2
};