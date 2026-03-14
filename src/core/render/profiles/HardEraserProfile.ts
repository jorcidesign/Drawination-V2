// src/core/render/profiles/HardEraserProfile.ts
import type { IBrushProfile } from './IBrushProfile';

export const HardEraserProfile: IBrushProfile = {
    id: 'eraser-hard',
    name: 'Borrador Duro',

    minSize: 4,
    maxSize: 120,
    baseSize: 30,
    baseOpacity: 1.0,
    blendMode: 'destination-out',

    renderer: 'basic', // <--- Usa el BasicRenderer
    textureType: 'solid',

    spacing: 0.05,
    angle: 0,
    aspectRatio: 1.0,
    pressureSizeSensitivity: 0.2,
    pressureOpacitySensitivity: 0.0,
    smoothing: 0.2
};