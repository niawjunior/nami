/**
 * AI Tool Definitions
 * 
 * This file contains all AI tool definitions extracted from server.ts
 * Uses a factory pattern to inject dependencies
 */
import { tool } from 'ai';
import { z } from 'zod';

interface ToolDependencies {
  fsTools: any;
  execAsync: (cmd: string, options: { cwd: string }) => Promise<{ stdout: string; stderr: string }>;
  shell: { openPath: (path: string) => Promise<string> };
  homedir: string;
}

export function createAITools(deps: ToolDependencies) {
  const { fsTools, execAsync, shell, homedir } = deps;

  return {
    // ===== READ-ONLY TOOLS =====
    
    listFiles: tool({
      description: 'List files in a directory. **ALWAYS USE THIS** to navigate, find, or show files. Supports filtering by type. Results are limited to 50 for efficiency.',
      inputSchema: z.object({
        path: z.string().describe('The absolute path to list'),
        recursive: z.boolean().optional().describe('Whether to list recursively'),
        sort: z.enum(['name', 'newest', 'oldest', 'type']).optional().describe('Sort order. Use "newest" for latest files.'),
        extensions: z.array(z.string()).optional().describe('Filter by file extensions. E.g., ["pdf"] for PDFs, ["jpg", "png"] for images.'),
      }),
      execute: async (args) => {
        const files = await fsTools.listFiles(args);
        const limit = 20; // Aggressive limit for AI context (UI uses separate IPC)
        const totalCount = files.length;
        const sliced = files.slice(0, limit);
        return {
          files: sliced,
          totalCount,
          truncated: totalCount > limit,
          message: totalCount > limit 
            ? `Showing ${limit} of ${totalCount} files. Use filters to narrow down.` 
            : `Found ${totalCount} files.`
        };
      },
    }),

    countFiles: tool({
      description: 'Count files in a directory efficiently. **ALWAYS USE THIS** for questions like "how many files...", "count the PDFs...". Do NOT use listFiles for counting.',
      inputSchema: z.object({
        path: z.string().describe('The absolute path to count in'),
        recursive: z.boolean().optional().describe('Whether to count recursively'),
        extensions: z.array(z.string()).optional().describe('Filter by file extensions'),
      }),
      execute: async (args) => {
        const count = await fsTools.countFiles(args);
        return `Found ${count} files.`;
      },
    }),

    checkFileExists: tool({
      description: 'Check if a specific file or folder exists. **ALWAYS USE THIS** to verify existence before creating, instead of listing all files.',
      inputSchema: z.object({
        path: z.string().describe('The absolute path to check'),
      }),
      execute: async ({ path }) => {
        const exists = await fsTools.checkFileExists({ path });
        return exists ? `Yes, "${path}" exists.` : `No, "${path}" does not exist.`;
      },
    }),

    readFile: tool({
      description: 'Read the content of a text file',
      inputSchema: z.object({
        path: z.string().describe('The absolute path to read'),
      }),
      execute: async (args) => fsTools.readFile(args),
    }),

    openFile: tool({
      description: 'Open a FILE (not folder) in its default external application (e.g., Preview for PDF, VS Code for code). **For folder navigation, use listFiles instead.**',
      inputSchema: z.object({
        path: z.string().describe('The absolute path to open'),
      }),
      execute: async ({ path }) => {
        const error = await shell.openPath(path);
        if (error) throw new Error(error);
        return `Opened ${path} successfully.`;
      },
    }),

    // ===== FILE MODIFICATION TOOLS (REQUIRE APPROVAL) =====

    moveFile: tool({
      description: 'Move or rename a SINGLE file. For multiple files, use moveFiles.',
      inputSchema: z.object({
        source: z.string().describe('The absolute source path'),
        destination: z.string().describe('The absolute destination path (full file path)'),
      }),
      // @ts-ignore
      needsApproval: true,
      execute: async (args: { source: string; destination: string }) => fsTools.moveFile(args),
    } as any),

    moveFiles: tool({
      description: 'Move MULTIPLE files to a destination folder. ALWAYS use this for batch operations.',
      inputSchema: z.object({
        sources: z.array(z.string()).describe('List of absolute paths to move'),
        destination: z.string().describe('The destination FOLDER path'),
      }),
      // @ts-ignore
      needsApproval: true,
      execute: async (args: { sources: string[]; destination: string }) => fsTools.moveFiles(args),
    } as any),

    trashFile: tool({
      description: 'Move a SINGLE file to trash. For multiple files, use trashFiles.',
      inputSchema: z.object({
        path: z.string().describe('The absolute path to trash'),
      }),
      // @ts-ignore
      needsApproval: true,
      execute: async (args: { path: string }) => fsTools.trashFile(args),
    } as any),

    trashFiles: tool({
      description: 'Move MULTIPLE files to trash. ALWAYS use this for batch operations.',
      inputSchema: z.object({
        paths: z.array(z.string()).describe('List of absolute paths to trash'),
      }),
      // @ts-ignore
      needsApproval: true,
      execute: async (args: { paths: string[] }) => fsTools.trashFiles(args),
    } as any),

    createDirectory: tool({
      description: 'Create a new directory',
      inputSchema: z.object({
        path: z.string().describe('The absolute path to create'),
      }),
      // @ts-ignore
      needsApproval: true,
      execute: async (args: { path: string }) => {
        console.log('EXECUTING createDirectory', args);
        return fsTools.createDirectory(args);
      },
    } as any),

    copyFile: tool({
      description: 'Copy a SINGLE file to a new location. For multiple files, use copyFiles.',
      inputSchema: z.object({
        source: z.string().describe('The absolute source file path'),
        destination: z.string().describe('The absolute destination path (full file path including name)'),
      }),
      // @ts-ignore
      needsApproval: true,
      execute: async (args: { source: string; destination: string }) => fsTools.copyFile(args),
    } as any),

    copyFiles: tool({
      description: 'Copy MULTIPLE files to a destination folder. ALWAYS use this for batch copy operations.',
      inputSchema: z.object({
        sources: z.array(z.string()).describe('List of absolute file paths to copy'),
        destination: z.string().describe('The destination FOLDER path'),
      }),
      // @ts-ignore
      needsApproval: true,
      execute: async (args: { sources: string[]; destination: string }) => fsTools.copyFiles(args),
    } as any),

    // ===== SHELL COMMAND TOOL (REQUIRES APPROVAL) =====

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

    // ===== PHASE 2: AI INTELLIGENCE TOOLS =====

    findLargeFiles: tool({
      description: 'Find large files (above a size threshold) in a directory. Useful for disk cleanup.',
      inputSchema: z.object({
        path: z.string().describe('The directory to scan'),
        minSizeMB: z.number().default(100).describe('Minimum file size in MB (default: 100)'),
        recursive: z.boolean().default(true).describe('Scan subdirectories'),
      }),
      execute: async (args) => {
        const result = await fsTools.findLargeFiles(args);
        return result;
      },
    }),

    getDirectoryStats: tool({
      description: 'Get comprehensive statistics about a directory: total size, file count, breakdown by type, and oldest/newest files.',
      inputSchema: z.object({
        path: z.string().describe('The directory to analyze'),
      }),
      execute: async (args) => {
        const stats = await fsTools.getDirectoryStats(args);
        return stats;
      },
    }),

    findDuplicates: tool({
      description: 'Find potential duplicate files by comparing file sizes, names, or both.',
      inputSchema: z.object({
        path: z.string().describe('The directory to scan'),
        method: z.enum(['size', 'name', 'both']).default('size').describe('How to detect duplicates'),
        recursive: z.boolean().default(true).describe('Scan subdirectories'),
      }),
      execute: async (args) => {
        const result = await fsTools.findDuplicates(args);
        return result;
      },
    }),
  };
}

// System prompt for the AI
export function getSystemPrompt(homedir: string, currentPath?: string): string {
  const pathContext = currentPath 
    ? `\nThe user is currently browsing: ${currentPath}\nWhen user says "go to X folder" or references a relative path, resolve it relative to the current browsing path.`
    : '';

  return `You are Nami, an expert file organization AI agent.
You have access to the user's local file system via tools.
The user's home directory is: ${homedir}${pathContext}

CRITICAL RULES:
1. **EXECUTE ACTIONS DIRECTLY**: When user wants to move, rename, copy, delete, or create → call the action tool IMMEDIATELY. Do NOT call checkFileExists first - the action will fail naturally if the file doesn't exist.
2. **RENAMING**: To rename a file/folder, use 'moveFile' with the same directory but new name. Example: rename /path/old to /path/new.
3. Use 'trashFile' for deletion requests (moves to trash for safety).
4. **FILE MANAGER NAVIGATION**: 
    - When user says "go to", "show me", or "open" a FOLDER → use 'listFiles' to update the sidebar.
    - **RELATIVE PATHS**: If user says "go to pdf folder" and current path is /Users/x/Desktop, use /Users/x/Desktop/pdf
    - 'openFile' is ONLY for opening FILES in external apps (Preview, VS Code, etc).
    - The UI displays file results. Do NOT repeat file names in text.
5. **EFFICIENCY**:
    - **COUNTING questions** ("how many..."): use 'countFiles' NOT 'listFiles'.
    - **BATCH OPERATIONS**: use moveFiles/copyFiles/trashFiles for multiple files. NEVER loop single-file tools.
    - **checkFileExists**: ONLY use when user explicitly asks "does X exist?" or before creating to avoid overwrite.
6. **SHELL COMMANDS (executeCommand)**:
    - Use for: git, npm, brew, du -sh, stat, zip/unzip, pbcopy
    - NEVER use for: ls, find, rm -rf, sudo
7. Be concise. Complete the user's request in as few steps as possible.
`;
}
