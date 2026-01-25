import { readTools } from './lib/read';
import { writeTools } from './lib/write';
import { analyzeTools } from './lib/analyze';
import { undoSystem } from './lib/undo';
export type { FileEntry } from './lib/types';

export const fsTools = {
  ...readTools,
  ...writeTools,
  ...analyzeTools,
};

export { undoSystem };
