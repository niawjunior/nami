/**
 * AI Tool Definitions
 * 
 * This file contains all AI tool definitions extracted from server.ts
 * Uses a factory pattern to inject dependencies
 */
import { tool } from 'ai';
import { z } from 'zod';
import path from 'path';

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
        // Ensure path is absolute for UI navigation
        const resolvedPath = path.resolve(args.path);
        const files = await fsTools.listFiles({ ...args, path: resolvedPath });
        
        const limit = 20; // Aggressive limit for AI context (UI uses separate IPC)
        const totalCount = files.length;
        const sliced = files.slice(0, limit);
        return {
          path: resolvedPath, // Return absolute path for UI
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
      description: 'Count files in a directory efficiently. **ALWAYS USE THIS** for questions like "how many files...", "count the PDFs...". Supports name pattern matching (e.g., "Screenshot*").',
      inputSchema: z.object({
        path: z.string().describe('The absolute path to count in'),
        recursive: z.boolean().optional().describe('Whether to count recursively'),
        extensions: z.array(z.string()).optional().describe('Filter by file extensions'),
        pattern: z.string().optional().describe('Filter by filename pattern (e.g., "Screenshot*", "*backup*")'),
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

    getFolderSize: tool({
      description: 'Calculate the total size of a folder recursively.',
      inputSchema: z.object({
        path: z.string().describe('The absolute path to the folder'),
      }),
      execute: async ({ path }) => fsTools.calculateFolderSize({ path }),
    }),

    readFile: tool({
      description: 'Read the content of a text file',
      inputSchema: z.object({
        path: z.string().describe('The absolute path to read'),
      }),
      execute: async (args) => fsTools.readFile(args),
    }),

    searchContent: tool({
      description: 'Search for text inside files (PDF, DOCX, TXT, code files). Returns matching files with preview snippets. Use this when user wants to find files containing specific content.',
      inputSchema: z.object({
        directory: z.string().describe('Directory to search in'),
        query: z.string().describe('Text to search for'),
        extensions: z.array(z.string()).optional().describe('Limit search to specific file types'),
        caseSensitive: z.boolean().optional().describe('Case-sensitive search'),
        maxResults: z.number().optional().describe('Maximum results to return (default: 20)'),
      }),
      execute: async (args) => fsTools.searchContent(args),
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
    }),

    batchRename: tool({
      description: 'Rename multiple files at once.',
      inputSchema: z.object({
         operations: z.array(z.object({
            original: z.string().describe('Original absolute path'),
            new: z.string().describe('New absolute path')
         }))
      }),
      // @ts-ignore
      needsApproval: true,
      execute: async (args: { operations: { original: string; new: string }[] }) => fsTools.batchRename(args.operations),
    }) as any,

    trashFiles: tool({
      description: 'Move MULTIPLE files to trash. ALWAYS use this for batch operations.',
      inputSchema: z.object({
        paths: z.array(z.string()).describe('List of absolute paths to trash'),
      }),
      // @ts-ignore
      needsApproval: true,
      execute: async (args: { paths: string[] }) => fsTools.trashFiles(args),
    } as any),

    trashByPattern: tool({
      description: 'Delete ALL files matching a pattern in a directory. Use this for commands like "delete all files starting with X". Pattern uses wildcards (* = any characters). More efficient than listing then deleting.',
      inputSchema: z.object({
        directory: z.string().describe('The directory to search in'),
        pattern: z.string().describe('Pattern to match filenames (e.g., "Screenshot*", "*backup*")'),
        extensions: z.array(z.string()).optional().describe('Optional: only match these extensions (e.g., ["png", "jpg"])'),
        recursive: z.boolean().optional().describe('Search subdirectories too (default: false)'),
      }),
      // @ts-ignore
      needsApproval: true,
      execute: async (args: { directory: string; pattern: string; extensions?: string[]; recursive?: boolean }) => fsTools.trashByPattern(args),
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
      description: 'Find potential duplicate files. Use "content" method for 100% accuracy (MD5 hash). Use "size" for speed.',
      inputSchema: z.object({
        path: z.string().describe('The directory to scan'),
        method: z.enum(['size', 'name', 'both', 'content']).default('size').describe('How to detect duplicates'),
        recursive: z.boolean().default(true).describe('Scan subdirectories'),
      }),
      execute: async (args) => {
        const result = await fsTools.findDuplicates(args);
        return result;
      },
    }),

    organizeByType: tool({
      description: 'Organize files into folders by type (Images/, Documents/, Videos/, etc). Uses dry-run by default to preview changes. Set dryRun=false to execute (requires approval).',
      inputSchema: z.object({
        path: z.string().describe('The directory to organize'),
        dryRun: z.boolean().default(true).describe('Preview changes without moving files'),
      }),
      // @ts-ignore
      needsApproval: (args: { dryRun: boolean }) => !args.dryRun,
      execute: async (args: { path: string; dryRun?: boolean }) => {
        const result = await fsTools.organizeByType(args);
        return result;
      },
    } as any),

    organizeByDate: tool({
      description: 'Organize files into folders by date (2024/, 2024-01/, etc). Uses dry-run by default to preview changes. Set dryRun=false to execute (requires approval).',
      inputSchema: z.object({
        path: z.string().describe('The directory to organize'),
        format: z.enum(['year', 'year-month', 'year-month-day']).default('year-month').describe('Date folder format'),
        dryRun: z.boolean().default(true).describe('Preview changes without moving files'),
      }),
      // @ts-ignore
      needsApproval: (args: { dryRun: boolean }) => !args.dryRun,
      execute: async (args: { path: string; format?: 'year' | 'year-month' | 'year-month-day'; dryRun?: boolean }) => {
        const result = await fsTools.organizeByDate(args);
        return result;
      },
    } as any),

    analyzeFolder: tool({
      description: 'Analyze a folder to understand its contents before organizing. Returns categorized breakdown (images, videos, documents, etc.), file counts, and suggestions. **ALWAYS use this first when user wants to organize a folder.**',
      inputSchema: z.object({
        path: z.string().describe('The directory to analyze'),
      }),
      execute: async (args) => {
        const result = await fsTools.analyzeFolder(args);
        return result;
      },
    }),

    // ===== UNDO TOOLS =====
    
    getUndoInfo: tool({
      description: 'Get information about available undo operations. Shows count and description of last operation.',
      inputSchema: z.object({}),
      execute: async () => {
        const { undoSystem } = await import('./fs');
        return undoSystem.getStackInfo();
      },
    }),

    undoLast: tool({
      description: 'Undo the last file operation (move, copy, or folder creation). Cannot undo trash operations.',
      inputSchema: z.object({}),
      // @ts-ignore
      needsApproval: true,
      execute: async () => {
        const { undoSystem } = await import('./fs');
        return undoSystem.undoLast();
      },
    } as any),
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
2. **COMPLETE THE WORKFLOW**: After listing files to identify targets, IMMEDIATELY proceed to execute the action (trashFiles, moveFiles, copyFiles, etc.) in the same response. Don't stop and wait after listing.
3. **RENAMING**: To rename a file/folder, use 'moveFile' with the same directory but new name. Example: rename /path/old to /path/new.
4. Use 'trashFile' for deletion requests (moves to trash for safety).
5. **FILE MANAGER NAVIGATION**: 
    - When user says "go to", "show me", or "open" a FOLDER → use 'listFiles' to update the sidebar.
    - **RELATIVE PATHS**: If user says "go to pdf folder" and current path is /Users/x/Desktop, use /Users/x/Desktop/pdf
    - 'openFile' is ONLY for opening FILES in external apps (Preview, VS Code, etc).
    - The UI displays file results. Do NOT repeat file names in text.
6. **EFFICIENCY**:
    - **COUNTING questions** ("how many..."): use 'countFiles' NOT 'listFiles'.
    - **BATCH OPERATIONS**: use moveFiles/copyFiles/trashFiles for multiple files. NEVER loop single-file tools.
    - **DUPLICATES**: When asked to find duplicates, use 'findDuplicates' with method='content' for accuracy, or 'size' for speed.
    - **checkFileExists**: ONLY use when user explicitly asks "does X exist?" or before creating to avoid overwrite.
7. **SHELL COMMANDS (executeCommand)**:
    - Use for: git, npm, brew, du -sh, stat, zip/unzip, pbcopy
    - NEVER use for: ls, find, rm -rf, sudo
8. **SMART ORGANIZE WORKFLOW**:
    - When user wants to "organize", "clean up", or "sort" a folder:
      1. FIRST call 'analyzeFolder' to understand the contents
      2. Present the analysis in a friendly summary (e.g., "I found ~20 images, ~15 documents, ~5 videos...")
      3. Offer numbered options:
         - **1. Full auto-organize** - Create folders by type and move everything
         - **2. Review plan first** - Show exactly what goes where before moving
         - **3. Just clean up junk** - Find and handle duplicates only
      4. Wait for user to pick an option before executing
    - When executing: use 'organizeByType' with dryRun=false (will request approval)
9. Be concise. Complete the user's request in as few steps as possible.
`;
}
