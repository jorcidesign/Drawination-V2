// src/core/render/profiles/PencilProfiles.ts
import type { IBrushProfile } from './IBrushProfile';

export const PencilProfile: IBrushProfile = {
    id: 'pencil-hb',
    name: 'Lápiz HB',

    minSize: 4,     // El grano necesita espacio para verse
    maxSize: 80,
    baseSize: 8,

    baseOpacity: 0.8,
    blendMode: 'source-over',
    renderer: 'basic',
    textureType: 'pencil-grain',
    spacing: 0.111222333333,
    angle: 0,
    aspectRatio: 1.0,
    pressureSizeSensitivity: 0.02,
    pressureOpacitySensitivity: 0.8,
    smoothing: 0.2
};
// Nota: Aplica minSize y maxSize a Paint, Airbrush, HardRound, etc.