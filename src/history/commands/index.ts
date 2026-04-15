// src/history/commands/index.ts
import './StrokeCommand';
import './EraseCommand';
import './HideCommand';
import './TransformCommand';
import './LayerCommand';
import './BackgroundColorCommand';
import './DuplicateGroupCommand'; // ← nuevo comando atómico

export { CommandFactory } from './CommandFactory';