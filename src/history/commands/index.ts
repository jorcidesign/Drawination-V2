// src/history/commands/index.ts
import './StrokeCommand';
import './EraseCommand';
import './HideCommand';
import './TransformCommand';
import './LayerCommand';
import './BackgroundColorCommand'; // ← nuevo

export { CommandFactory } from './CommandFactory';