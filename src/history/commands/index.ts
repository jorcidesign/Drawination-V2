// src/history/commands/index.ts

// Al importar estos archivos, el código al final de cada uno 
// (CommandFactory.register...) se ejecutará automáticamente.
import './StrokeCommand';
import './EraseCommand';
import './MoveCommand';

// Si en el futuro creas un FillCommand, solo lo agregas aquí:
// import './FillCommand';

export { CommandFactory } from './CommandFactory';