// src/core/render/profiles/HardEraserProfile.ts
import type { IBrushProfile } from './IBrushProfile';

export const HardEraserProfile: IBrushProfile = {
    id: 'eraser-hard',
    name: 'Borrador Duro',

    baseSize: 30,          // Más grande por defecto
    baseOpacity: 1.0,      // Borra al 100%
    blendMode: 'destination-out', // MODO BORRADOR

    textureType: 'solid',  // Sin grano, corte limpio
    spacing: 0.05,         // Fluido

    angle: 0,
    aspectRatio: 1.0,      // Círculo perfecto
    renderMode: 'stroke',
    pressureSizeSensitivity: 0.2, // Que cambie un poquitito de tamaño
    pressureOpacitySensitivity: 0.0, // La presión no debe afectar la opacidad al borrar duro
    smoothing: 0.2
};