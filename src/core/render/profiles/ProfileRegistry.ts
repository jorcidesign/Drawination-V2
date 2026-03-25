// src/core/render/profiles/ProfileRegistry.ts
import type { IBrushProfile } from './IBrushProfile';
import { PencilProfile } from './PencilProfiles';
import { InkProfile } from './InkProfile';
import { HardEraserProfile } from './HardEraserProfile';
import { FillProfile } from './FillProfile';
import { PaintProfile } from './PaintProfile';
import { HardRoundProfile } from './HardRoundProfile';
import { AirbrushProfile } from './AirbrushProfile';
import { CharcoalProfile } from './CharcoalProfile';
import { StylizedProfile } from './StylizedProfile'; // <--- AÑADIR IMPORT

export const ProfileRegistry: Record<string, IBrushProfile> = {
    [PencilProfile.id]: PencilProfile,
    [InkProfile.id]: InkProfile,
    [HardEraserProfile.id]: HardEraserProfile,
    [FillProfile.id]: FillProfile,
    [PaintProfile.id]: PaintProfile,
    [HardRoundProfile.id]: HardRoundProfile,
    [AirbrushProfile.id]: AirbrushProfile,
    [CharcoalProfile.id]: CharcoalProfile,
    [StylizedProfile.id]: StylizedProfile, // <--- AÑADIR REGISTRO
};