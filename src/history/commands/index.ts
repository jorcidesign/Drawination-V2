// src/history/commands/index.ts
//
// Auto-registro de todos los comandos.
// Al importar este archivo, cada comando se registra en CommandFactory.
//
// CAMBIO: añadido TransformCommand para que TRANSFORM no caiga en DummyCommand.

import './StrokeCommand';
import './EraseCommand';
import './HideCommand';
import './TransformCommand';

// Futuros:
// import './FillCommand';
// import './DuplicateGroupCommand';
// import './LayerCommand';

export { CommandFactory } from './CommandFactory';