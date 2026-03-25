// src/core/render/profiles/StylizedProfile.ts
import type { IBrushProfile } from './IBrushProfile';

export const StylizedProfile: IBrushProfile = {
    id: 'stylized-brush',
    name: 'Pincel Estilizado',

    minSize: 2,
    maxSize: 150,
    baseSize: 20,

    baseOpacity: 1.0,
    blendMode: 'source-over',

    renderer: 'stylized', // Nuestro nuevo renderer mágico
    textureType: 'solid',

    spacing: 0.05,
    angle: 0,
    aspectRatio: 1.0,

    // La presión física del usuario se ignora por completo
    pressureSizeSensitivity: 0.0,
    pressureOpacitySensitivity: 0.0,
    pressureSizeMin: 1.0,
    pressureSizeMax: 1.0,
    pressureOpacityMin: 1.0,
    pressureOpacityMax: 1.0,

    // Suavizado alto para que el trazo caligráfico se vea elegante
    smoothing: 0.7,

    physics: {
        stabilizerWindow: 12
    }
};