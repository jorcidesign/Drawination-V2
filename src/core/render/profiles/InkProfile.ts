// src/core/render/profiles/InkProfile.ts
import type { IBrushProfile } from './IBrushProfile';

export const InkProfile: IBrushProfile = {
    id: 'ink-pen',
    name: 'Pluma de Tinta',

    minSize: 2.5,
    maxSize: 100,
    baseSize: 8,

    baseOpacity: 1.0,
    blendMode: 'source-over',
    renderer: 'ink',
    textureType: 'solid',
    spacing: 0.02,
    angle: -45,
    aspectRatio: 0.25,

    // Presión controla el TAMAÑO — física de pluma mangaka.
    // Con renderer procedural (ctx.ellipse) esto es 100% consistente
    // entre vivo y rebuild porque no hay drawImage de canvas intermediario.
    // 0.8 = rango amplio como Ancient Ink / Sumi: presión leve → trazo fino,
    // presión máxima → trazo ancho. Exactamente como una pluma de tinta real.
    pressureSizeSensitivity: 0.8,

    pressureOpacitySensitivity: 0.0,
    smoothing: 0.6
};