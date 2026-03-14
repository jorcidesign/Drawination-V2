// src/core/render/profiles/AirbrushProfile.ts
import type { IBrushProfile } from './IBrushProfile';

export const AirbrushProfile: IBrushProfile = {
    id: 'airbrush',
    name: 'Aerógrafo',

    baseSize: 40,
    baseOpacity: 1.0,
    blendMode: 'source-over',

    renderer: 'airbrush',

    // Spacing muy cerrado — el aerógrafo produce una nube continua
    // 0.1 produce stamps solapados que se funden suavemente
    spacing: 0.1,
    angle: 0,
    aspectRatio: 1.0, // circular perfecto



    // El tamaño NO varía con la presión — el aerógrafo mantiene su cono
    // Solo la cantidad de pintura (opacidad) responde a la presión
    pressureSizeSensitivity: 0.0,
    pressureOpacitySensitivity: 0.0, // controlado internamente por flow
    smoothing: 0.3,

    physics: {
        // Flow bajo = acumulación gradual y natural
        // 0.15 significa que necesitas pasar ~7 veces para llegar al color sólido
        // Sube a 0.25 para aerógrafo más "cargado"
        flow: 0.15,
    },
    minSize: 0,
    maxSize: 0
};