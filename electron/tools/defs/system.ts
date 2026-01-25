import { tool } from 'ai';
import { z } from 'zod';

interface SystemToolDependencies {
  execAsync: (cmd: string, options: { cwd: string }) => Promise<{ stdout: string; stderr: string }>;
  homedir: string;
}

export function createSystemTools({ execAsync, homedir }: SystemToolDependencies) {
  return {
    executeCommand: tool({
      description: 'Execute a whitelisted shell command. Allowed: git, npm, npx, brew, du, stat, zip, unzip, tar, pbcopy, pbpaste, open, which, echo, cat (for small files), head, tail, wc.',
      inputSchema: z.object({
        command: z.string().describe('The shell command to execute'),
      }),
      // @ts-ignore
      needsApproval: true,
      execute: async (args: { command: string }) => {
        const { command } = args;
        const trimmedCmd = command.trim();
        
        // WHITELIST approach - only allow specific commands
        const allowedCommands = [
          'git', 'npm', 'npx', 'yarn', 'pnpm',  // Package managers
          'brew',                               // Homebrew
          'du', 'df', 'stat',                   // Disk/file info
          'zip', 'unzip', 'tar', 'gzip',        // Archives
          'pbcopy', 'pbpaste',                  // Clipboard
          'open', 'which', 'echo', 'pwd',       // Utilities
          'cat', 'head', 'tail', 'wc', 'grep',  // File reading (safe)
          'mkdir', 'touch',                     // File creation
          'python', 'python3', 'node',          // Runtimes (for scripts)
        ];
        
        // Extract base command (first word, handle paths like /usr/bin/git)
        const baseCmd = trimmedCmd.split(/\s+/)[0].split('/').pop() || '';
        
        if (!allowedCommands.includes(baseCmd)) {
          throw new Error(
            `Command "${baseCmd}" is not in the allowed list. ` +
            `Allowed commands: ${allowedCommands.join(', ')}. ` +
            `For file operations, use the dedicated tools (moveFile, trashFile, etc).`
          );
        }
        
        // Block dangerous patterns even in allowed commands
        const dangerousPatterns = ['> /dev/', '| rm', '&& rm', '; rm', 'sudo', '--force'];
        for (const pattern of dangerousPatterns) {
          if (trimmedCmd.toLowerCase().includes(pattern)) {
            throw new Error(`Blocked dangerous pattern: "${pattern}"`);
          }
        }
        
        // Block ls/find (use listFiles for UI visibility)
        if (baseCmd === 'ls' || baseCmd === 'find') {
          throw new Error("Use 'listFiles' tool instead so files appear in the UI.");
        }

        try {
          const { stdout, stderr } = await execAsync(command, { cwd: homedir });
          if (stderr) {
            return `Output: ${stdout}\nWarning: ${stderr}`;
          }
          return stdout || 'Command executed successfully with no output.';
        } catch (error: any) {
          return `Command failed: ${error.message}`;
        }
      },
    } as any),

    getUndoInfo: tool({
      description: 'Get information about available undo operations. Shows count and description of last operation.',
      inputSchema: z.object({}),
      execute: async () => {
        const { undoSystem } = await import('../fs'); // Relative import might need adjustment, depends on where this file is vs fs.ts
        // fs.ts is in ../../fs relative to tools/defs/system.ts (electron/tools/defs/system.ts -> electron/tools/fs.ts)
        // Actually fs.ts is in electron/tools/fs.ts. 
        // This file is in electron/tools/defs/system.ts.
        // So import is `../fs` (one up is tools, then fs).
        return undoSystem.getStackInfo();
      },
    }),

    undoLast: tool({
      description: 'Undo the last file operation (move, copy, or folder creation). Cannot undo trash operations.',
      inputSchema: z.object({}),
      // @ts-ignore
      needsApproval: true,
      execute: async () => {
        const { undoSystem } = await import('../fs');
        return undoSystem.undoLast();
      },
    } as any),
  };
}
