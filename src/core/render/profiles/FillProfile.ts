// src/core/render/profiles/FillProfile.ts
import type { IBrushProfile } from './IBrushProfile';

export const FillProfile: IBrushProfile = {
    id: 'solid-fill',
    name: 'Bote de Relleno',

    minSize: 4,
    maxSize: 120,
    baseSize: 10,
    baseOpacity: 1.0,
    blendMode: 'source-over',

    renderer: 'fill', // <--- Usa el FillRenderer

    spacing: 1.0,
    angle: 0,
    aspectRatio: 1.0,
    pressureSizeSensitivity: 0,
    pressureOpacitySensitivity: 0,
    smoothing: 0.5
};