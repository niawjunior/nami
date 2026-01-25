import { tool } from 'ai';
import { z } from 'zod';

interface WriteToolDependencies {
  fsTools: any;
}

export function createWriteTools({ fsTools }: WriteToolDependencies) {
  return {
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
  };
}
