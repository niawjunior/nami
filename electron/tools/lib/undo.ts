/**
 * Undo System for File Operations
 * 
 * Stores the last 10 operations and provides undo capability
 */

import fs from 'fs/promises';
import path from 'path';
import trash from 'trash';

// Operation types that can be undone
export type UndoableOperation = 
  | { type: 'move'; source: string; destination: string }
  | { type: 'copy'; destination: string } // Can only delete the copy
  | { type: 'create_directory'; path: string }
  | { type: 'trash'; paths: string[]; originalLocations?: string[] }; // Note: Restoring from trash is OS-dependent

// In-memory operation stack (last 10)
const operationStack: UndoableOperation[] = [];
const MAX_OPERATIONS = 10;

export const undoSystem = {
  /**
   * Record an operation for potential undo
   */
  recordOperation(op: UndoableOperation): void {
    operationStack.push(op);
    if (operationStack.length > MAX_OPERATIONS) {
      operationStack.shift(); // Remove oldest
    }
    console.log('[Undo] Recorded:', op.type, 'Stack size:', operationStack.length);
  },

  /**
   * Get the last operation without removing it
   */
  peekLast(): UndoableOperation | undefined {
    return operationStack[operationStack.length - 1];
  },

  /**
   * Get undo stack info for display
   */
  getStackInfo(): { count: number; lastOperation: string | null } {
    const last = this.peekLast();
    let lastOperation: string | null = null;
    
    if (last) {
      switch (last.type) {
        case 'move':
          lastOperation = `Move: ${path.basename(last.source)} → ${path.basename(last.destination)}`;
          break;
        case 'copy':
          lastOperation = `Copy: ${path.basename(last.destination)}`;
          break;
        case 'create_directory':
          lastOperation = `Create folder: ${path.basename(last.path)}`;
          break;
        case 'trash':
          lastOperation = `Trash: ${last.paths.length} item(s)`;
          break;
      }
    }
    
    return { count: operationStack.length, lastOperation };
  },

  /**
   * Undo the last operation
   */
  async undoLast(): Promise<{ success: boolean; message: string }> {
    const op = operationStack.pop();
    
    if (!op) {
      return { success: false, message: 'No operations to undo' };
    }
    
    try {
      switch (op.type) {
        case 'move': {
          // Reverse the move: move from destination back to source
          await fs.rename(op.destination, op.source);
          return { success: true, message: `Undone: moved ${path.basename(op.destination)} back to ${path.dirname(op.source)}` };
        }
        
        case 'copy': {
          // Delete the copied file
          await trash(op.destination);
          return { success: true, message: `Undone: removed copy ${path.basename(op.destination)}` };
        }
        
        case 'create_directory': {
          // Remove the directory (only if empty)
          try {
            await fs.rmdir(op.path);
            return { success: true, message: `Undone: removed folder ${path.basename(op.path)}` };
          } catch (err: any) {
            if (err.code === 'ENOTEMPTY') {
              return { success: false, message: `Cannot undo: folder ${path.basename(op.path)} is not empty` };
            }
            throw err;
          }
        }
        
        case 'trash': {
          // Cannot reliably restore from trash - inform user
          return { 
            success: false, 
            message: `Cannot undo trash operation. ${op.paths.length} item(s) were moved to Trash. You can restore them manually from Trash.` 
          };
        }
        
        default:
          return { success: false, message: 'Unknown operation type' };
      }
    } catch (error: any) {
      // Put operation back since undo failed
      operationStack.push(op);
      return { success: false, message: `Undo failed: ${error.message}` };
    }
  },

  /**
   * Clear the undo stack
   */
  clear(): void {
    operationStack.length = 0;
  }
};
