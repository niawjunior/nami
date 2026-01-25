import { tool } from 'ai';
import { z } from 'zod';

interface AnalyzeToolDependencies {
  fsTools: any;
}

export function createAnalyzeTools({ fsTools }: AnalyzeToolDependencies) {
  return {
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
  };
}
