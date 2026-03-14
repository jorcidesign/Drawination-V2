// src/core/render/profiles/ProfileRegistry.ts
import type { IBrushProfile } from './IBrushProfile';
import { PencilProfile } from './PencilProfiles';
import { InkProfile } from './InkProfile';
import { HardEraserProfile } from './HardEraserProfile';
import { FillProfile } from './FillProfile';
import { PaintProfile } from './PaintProfile';
import { HardRoundProfile } from './HardRoundProfile'; // <-- IMPORTAR

import { AirbrushProfile } from './AirbrushProfile';
import { CharcoalProfile } from './CharcoalProfile';


export const ProfileRegistry: Record<string, IBrushProfile> = {
    [PencilProfile.id]: PencilProfile,
    [InkProfile.id]: InkProfile,
    [HardEraserProfile.id]: HardEraserProfile,
    [FillProfile.id]: FillProfile,
    [PaintProfile.id]: PaintProfile,
    [HardRoundProfile.id]: HardRoundProfile, // <-- REGISTRAR
    [AirbrushProfile.id]: AirbrushProfile,
    [CharcoalProfile.id]: CharcoalProfile,
};