// src/core/render/profiles/CharcoalProfile.ts
import type { IBrushProfile } from './IBrushProfile';

export const CharcoalProfile: IBrushProfile = {
    id: 'charcoal',
    name: 'Carboncillo',

    minSize: 25,
    maxSize: 120,
    baseSize: 28,

    // Opacidad base más baja para que funcione como un polvo texturizado
    baseOpacity: 0.25,
    blendMode: 'source-over',
    renderer: 'charcoal',

    spacing: 0.05,
    angle: 0,

    // === EL CAMBIO FÍSICO ===
    // 0.33 equivale a la proporción 1:3 (1 de ancho por 3 de alto).
    // Esto hace que el "palo" de carbón sea más grueso y cubra más área.
    aspectRatio: 0.33,

    // El palo de carbón tiene un tamaño físico fijo, no cambia con la presión
    pressureSizeSensitivity: 0.0,

    // La presión dicta puramente cuánto pigmento se transfiere al papel
    pressureOpacitySensitivity: 0.8,

    smoothing: 0.3,

    physics: {
        // Le confirmamos al motor de físicas la misma proporción (3 de alto, 1 de ancho)
        charcoalAspect: 0.33,
    }
};