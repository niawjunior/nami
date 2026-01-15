import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

interface ScanOptions {
  path: string;
  recursive?: boolean;
  extensions?: string[];
  pattern?: string; // Regex pattern for filenames
  minSize?: number;
  ignore?: string[];
}

export class FileSystemScanner {
  /**
   * Efficiently scan directory using glob
   */
  static async scan(options: ScanOptions): Promise<string[]> {
    const { path: dirPath, recursive = true, extensions, pattern, ignore } = options;
    
    // Construct glob pattern
    let globPattern = '**/*';
    if (extensions && extensions.length > 0) {
      globPattern = `**/*.{${extensions.join(',')}}`;
    }
    
    // If not recursive, restrict glob
    if (!recursive) {
        globPattern = extensions && extensions.length > 0 
           ? `*.{${extensions.join(',')}}` 
           : '*';
    }

    try {
      // Use glob for efficient scanning
      const matches = await glob(globPattern, {
        cwd: dirPath,
        nodir: true,
        dot: false,
        ignore: ignore || ['**/node_modules/**', '**/.git/**', '**/.DS_Store'],
        absolute: true // Return absolute paths
      });
      
      // Filter by regex pattern if needed
      if (pattern) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'), 'i');
        return matches.filter(f => regex.test(path.basename(f)));
      }

      return matches;
    } catch (error: any) {
        console.error('Scan error:', error);
        return [];
    }
  }
}
