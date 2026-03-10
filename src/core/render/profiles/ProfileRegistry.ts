// src/core/render/profiles/ProfileRegistry.ts
import type { IBrushProfile } from './IBrushProfile';
import { PencilProfile } from './PencilProfiles';
import { InkProfile } from './InkProfile';
import { HardEraserProfile } from './HardEraserProfile';
import { FillProfile } from './FillProfile';

export const ProfileRegistry: Record<string, IBrushProfile> = {
    [PencilProfile.id]: PencilProfile,
    [InkProfile.id]: InkProfile,
    [HardEraserProfile.id]: HardEraserProfile,
    [FillProfile.id]: FillProfile
};