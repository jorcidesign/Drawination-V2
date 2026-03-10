// src/core/render/profiles/IBrushProfile.ts
export interface IBrushProfile {
    id: string;
    name: string;

    baseSize: number;
    baseOpacity: number;
    blendMode: GlobalCompositeOperation;

    // === NUEVO: Modo de Renderizado ===
    renderMode: 'stroke' | 'fill';

    textureType: 'solid' | 'pencil-grain';
    spacing: number;

    angle: number;
    aspectRatio: number;

    pressureSizeSensitivity: number;
    pressureOpacitySensitivity: number;
    smoothing: number;
}