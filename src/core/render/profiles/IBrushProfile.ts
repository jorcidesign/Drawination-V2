// src/core/render/profiles/IBrushProfile.ts
export interface IBrushProfile {
    id: string;
    name: string;

    minSize: number;
    maxSize: number;

    baseSize: number;
    baseOpacity: number;
    baseFlow?: number;
    blendMode: GlobalCompositeOperation;

    renderer: 'basic' | 'fill' | 'paint' | 'hard-round' | 'ink' | 'airbrush' | 'charcoal';

    spacing: number;
    angle: number;
    aspectRatio: number;

    // === CONTROLES DINÁMICOS POR PRESIÓN (ESTILO PROCREATE) ===
    pressureSizeSensitivity: number; // (Obsoleto, mantenido por compatibilidad)
    pressureOpacitySensitivity: number; // (Obsoleto)

    pressureSizeMin?: number;     // Tamaño a presión 0 (Ej: 0.14)
    pressureSizeMax?: number;     // Tamaño a máxima presión (Ej: 0.84)

    pressureOpacityMin?: number;  // Opacidad a presión 0 (Ej: 0.30)
    pressureOpacityMax?: number;  // Opacidad a máxima presión (Ej: 1.0)

    pressureFlowMin?: number;     // Flujo a presión 0
    pressureFlowMax?: number;     // Flujo a máxima presión

    smoothing: number;

    textureType?: 'solid' | 'pencil-grain' | 'bristle-paint';

    physics?: {
        bristleCount?: number;
        depletionRate?: number;
        saturationK?: number;
        separationFactor?: number;
        velocityK?: number;
        grainFrequency?: number;
        flow?: number;
        stabilizerWindow?: number;
        pressureCurve?: { p1y: number, p2y: number };
        charcoalAspect?: number;
    };
}