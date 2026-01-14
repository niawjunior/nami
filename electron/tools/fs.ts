import fs from 'fs/promises';
import { constants } from 'fs';
import path from 'path';
import trash from 'trash';
import { glob } from 'glob';
import os from 'os';

// Polyfill DOM elements for pdf-parse in Node context
const polyfillDOM = () => {
    if (typeof global.DOMMatrix === 'undefined') {
        // @ts-ignore
        global.DOMMatrix = class DOMMatrix {
            constructor() { }
            translate() { return this; }
            scale() { return this; }
            multiply() { return this; }
            transformPoint(p: any) { return p; }
            inverse() { return this; }
        };
    }
    if (typeof global.ImageData === 'undefined') {
        // @ts-ignore
        global.ImageData = class ImageData {
            constructor(data: any, w: any, h: any) { }
        };
    }
    if (typeof global.Path2D === 'undefined') {
        // @ts-ignore
        global.Path2D = class Path2D {
            constructor() { }
        };
    }
};
polyfillDOM();

// @ts-ignore
let pdf: any;
try {
  pdf = require('pdf-parse');
} catch (e) {
  console.error('Failed to load pdf-parse:', e);
}
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  lastModified: number;
  _meta?: string;
}

export const fsTools = {
  // Efficiently count files matching criteria
  async countFiles({ path: dirPath, recursive = false, extensions }: { path: string; recursive?: boolean; extensions?: string[] }): Promise<number> {
      try {
          const pattern = recursive ? '**/*' : '*';
          const files = await glob(pattern, { 
              cwd: dirPath, 
              nodir: true,
              ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**']
          });
          
          if (!extensions || extensions.length === 0) return files.length;
          
          const normalizedExts = extensions.map(e => e.toLowerCase().replace(/^\./, ''));
          return files.filter(f => {
              const ext = path.extname(f).toLowerCase().slice(1);
              return normalizedExts.includes(ext);
          }).length;
      } catch (error) {
          return 0;
      }
  },

  async checkFileExists({ path: filePath }: { path: string }): Promise<boolean> {
      try {
          await fs.access(filePath);
          return true;
      } catch {
          return false;
      }
  },

  async listFiles({ path: dirPath, recursive = false, sort = 'name', extensions }: { path: string; recursive?: boolean; sort?: 'name' | 'newest' | 'oldest' | 'type'; extensions?: string[] }): Promise<FileEntry[]> {
    
    if (recursive && dirPath === os.homedir()) {
        throw new Error("Recursive search of Home Directory is blocked for safety. Please target a specific folder (e.g. Desktop, Downloads).");
    }

    // Normalize extensions (remove leading dots, lowercase)
    const normalizedExtensions = extensions?.map(ext => ext.replace(/^\./, '').toLowerCase());

    try {
      let allFiles: FileEntry[] = [];
      let rawFiles: { name: string, path: string, isDirectory: boolean, stats?: any }[] = [];

      if (recursive) {
        const globFiles = await glob('**/*', { 
            cwd: dirPath, 
            withFileTypes: true,
            ignore: ['**/node_modules/**', '**/.git/**', '**/Library/**', '**/.Trash/**', '**/AppData/**']
        });
        
        allFiles = globFiles.map(f => ({
          name: f.name,
          path: f.fullpath(),
          isDirectory: f.isDirectory(),
          size: 0,
          lastModified: 0
        }));
      } else {
         const entries = await fs.readdir(dirPath, { withFileTypes: true });
         
         rawFiles = await Promise.all(entries.map(async (entry) => {
             const fullPath = path.join(dirPath, entry.name);
             let stats;
             try { stats = await fs.stat(fullPath); } catch (e) {}
             
             return {
                name: entry.name,
                path: fullPath,
                isDirectory: entry.isDirectory(),
                size: stats?.size || 0,
                lastModified: stats?.mtimeMs || 0,
                stats
             };
         }));
      }

      // Sort
      if (!recursive) {
          if (sort === 'newest') {
              rawFiles.sort((a, b) => (b.stats?.mtimeMs || 0) - (a.stats?.mtimeMs || 0));
          } else if (sort === 'oldest') {
              rawFiles.sort((a, b) => (a.stats?.mtimeMs || 0) - (b.stats?.mtimeMs || 0));
          } else if (sort === 'type') {
              rawFiles.sort((a, b) => {
                  if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
                  return a.isDirectory ? -1 : 1;
              });
          } else {
              // Name default
              rawFiles.sort((a, b) => a.name.localeCompare(b.name));
          }

          allFiles = rawFiles.map(f => ({
              name: f.name,
              path: f.path,
              isDirectory: f.isDirectory,
              size: f.stats?.size || 0,
              lastModified: f.stats?.mtimeMs || 0
          }));
      }

      // Filter by extensions if specified
      if (normalizedExtensions && normalizedExtensions.length > 0) {
          allFiles = allFiles.filter(f => {
              if (f.isDirectory) return false; // Exclude directories when filtering by extension
              const ext = f.name.split('.').pop()?.toLowerCase();
              return ext && normalizedExtensions.includes(ext);
          });
      }

      // Return all files (no limit needed for native file browser)
      return allFiles;
    } catch (error) {
       // @ts-ignore
      throw new Error(`Failed to list files: ${error.message}`);
    }
  },

  async readFile({ path: filePath }: { path: string }) {
    try {
      const ext = path.extname(filePath).toLowerCase();

      if (ext === '.pdf') {
          if (!pdf) {
              console.error('PDF module not loaded. Attempting to load...');
              try {
                  pdf = require('pdf-parse');
              } catch (e) {
                  throw new Error('PDF support is not available. The pdf-parse module could not be loaded.');
              }
          }
          try {
              const dataBuffer = await fs.readFile(filePath);
              const data = await pdf(dataBuffer);
              return data.text || 'PDF text extraction returned empty content.';
          } catch (pdfErr: any) {
              console.error('PDF parsing error:', pdfErr);
              throw new Error(`Failed to parse PDF: ${pdfErr.message}`);
          }
      }

      if (ext === '.docx') {
          const buffer = await fs.readFile(filePath);
          const result = await mammoth.extractRawText({ buffer });
          return result.value;
      }

      if (ext === '.xlsx' || ext === '.xls') {
          const buffer = await fs.readFile(filePath);
          const workbook = XLSX.read(buffer, { type: 'buffer' });
          let content = '';
          workbook.SheetNames.forEach(sheetName => {
              const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
              content += `--- Sheet: ${sheetName} ---\n${csv}\n\n`;
          });
          return content;
      }

      // Default to text/utf-8
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
       // @ts-ignore
      throw new Error(`Failed to read file: ${error.message}`);
    }
  },

  async moveFile({ source, destination }: { source: string; destination: string }) {
    try {
      await fs.rename(source, destination);
      return `Moved ${source} to ${destination}`;
    } catch (error) {
       // @ts-ignore
      throw new Error(`Failed to move file: ${error.message}`);
    }
  },

  async moveFiles({ sources, destination }: { sources: string[]; destination: string }) {
    try {
        await fs.mkdir(destination, { recursive: true });
        const results = [];
        const errors = [];
        for (const src of sources) {
            // Check if source exists
             try {
                await fs.access(src);
             } catch {
                errors.push(`${src} not found`);
                continue;
             }
             
            const fileName = path.basename(src);
            const destPath = path.join(destination, fileName);
            try {
                await fs.rename(src, destPath);
                results.push(src);
            } catch (err: any) {
                errors.push(`${src}: ${err.message}`);
            }
        }
        if (errors.length > 0 && results.length === 0) {
            throw new Error(`Failed to move files: ${errors.join(', ')}`);
        }
        return `Moved ${results.length} files to ${destination}. ${errors.length > 0 ? `Errors: ${errors.join(', ')}` : ''}`;
    } catch (error: any) {
        throw new Error(`Batch move failed: ${error.message}`);
    }
  },

  async trashFile({ path: filePath }: { path: string }) {
    try {
      await trash(filePath);
      return `Moved ${filePath} to trash`;
    } catch (error) {
       // @ts-ignore
      throw new Error(`Failed to trash file: ${error.message}`);
    }
  },

  async trashFiles({ paths }: { paths: string[] }) {
      try {
          await trash(paths);
          return `Moved ${paths.length} files to trash`;
      } catch (error: any) {
          throw new Error(`Failed to trash files: ${error.message}`);
      }
  },
  
  async createDirectory({ path: dirPath }: { path: string }) {
      try {
          await fs.mkdir(dirPath, { recursive: true });
          return `Created directory ${dirPath}`;
      } catch (error) {
       // @ts-ignore
          throw new Error(`Failed to create directory: ${error.message}`);
      }
  },

  async copyFile({ source, destination }: { source: string; destination: string }) {
      try {
          // Ensure destination directory exists
          const destDir = path.dirname(destination);
          await fs.mkdir(destDir, { recursive: true });
          await fs.copyFile(source, destination);
          return `Copied ${path.basename(source)} to ${destination}`;
      } catch (error: any) {
          throw new Error(`Failed to copy file: ${error.message}`);
      }
  },

  async copyFiles({ sources, destination }: { sources: string[]; destination: string }) {
      try {
          // Ensure destination directory exists
          await fs.mkdir(destination, { recursive: true });
          
          const results: string[] = [];
          for (const source of sources) {
              const destPath = path.join(destination, path.basename(source));
              await fs.copyFile(source, destPath);
              results.push(path.basename(source));
          }
          return `Copied ${results.length} files to ${destination}: ${results.join(', ')}`;
      } catch (error: any) {
          throw new Error(`Failed to copy files: ${error.message}`);
      }
  }
};
