// src/core/render/profiles/InkProfile.ts
import type { IBrushProfile } from './IBrushProfile';

export const InkProfile: IBrushProfile = {
    id: 'ink-pen',
    name: 'Pluma de Tinta',

    baseSize: 20,
    baseOpacity: 1.0,      // La tinta siempre es sólida
    blendMode: 'source-over',

    textureType: 'solid',
    spacing: 0.02,         // 2% de espaciado: ultra fluido y continuo

    // Geometría de la Tinta (Óvalo inclinado basado en tu imagen)
    angle: -45,
    aspectRatio: 0.25,
    renderMode: 'stroke',
    pressureSizeSensitivity: 0.8, // La presión controla el grosor dramáticamente
    pressureOpacitySensitivity: 0.0, // La presión NO afecta la opacidad
    smoothing: 0.6 // Más suavizado para estabilizar el pulso en lineart
};