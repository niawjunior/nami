import { tool } from 'ai';
import { z } from 'zod';
import path from 'path';

interface ReadToolDependencies {
  fsTools: any;
  shell: { openPath: (path: string) => Promise<string> };
}

export function createReadTools({ fsTools, shell }: ReadToolDependencies) {
  return {
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
      execute: async ({ path }) => {
        const bytes = await fsTools.calculateFolderSize({ path });
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        if (bytes === 0) return 'Total size: 0 B';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        const formatted = parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
        return `Total size: ${formatted} (${bytes} bytes)`;
      },
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
  };
}
