// src/history/commands/index.ts
//
// Auto-registro de todos los comandos.
// Al importar este archivo, cada comando se registra en CommandFactory.

import './StrokeCommand';
import './EraseCommand';
import './HideCommand';
import './TransformCommand';
import './LayerCommand'; // <--- AÑADIDO

// Futuros:
// import './FillCommand';
// import './DuplicateGroupCommand';

export { CommandFactory } from './CommandFactory';