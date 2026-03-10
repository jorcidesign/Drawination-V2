// src/core/render/profiles/FillProfile.ts
import type { IBrushProfile } from './IBrushProfile';

export const FillProfile: IBrushProfile = {
    id: 'solid-fill',
    name: 'Bote de Relleno',

    baseSize: 10, // El tamaño no importa para el relleno
    baseOpacity: 1.0,
    blendMode: 'source-over',
    renderMode: 'fill', // LA MAGIA

    textureType: 'solid',
    spacing: 1.0,
    angle: 0,
    aspectRatio: 1.0,

    pressureSizeSensitivity: 0,
    pressureOpacitySensitivity: 0,
    smoothing: 0.5
};