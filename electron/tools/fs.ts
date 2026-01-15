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
  },

  // ===== PHASE 2: AI INTELLIGENCE TOOLS =====

  async findLargeFiles({ 
    path: dirPath, 
    minSizeMB = 100, 
    recursive = true 
  }: { 
    path: string; 
    minSizeMB?: number; 
    recursive?: boolean 
  }): Promise<{ files: FileEntry[]; totalSize: string }> {
    const minBytes = minSizeMB * 1024 * 1024;
    const largeFiles: FileEntry[] = [];
    
    async function scan(dir: string) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          try {
            if (entry.isDirectory()) {
              if (recursive) await scan(fullPath);
            } else {
              const stats = await fs.stat(fullPath);
              if (stats.size >= minBytes) {
                largeFiles.push({
                  name: entry.name,
                  path: fullPath,
                  isDirectory: false,
                  size: stats.size,
                  lastModified: stats.mtimeMs,
                });
              }
            }
          } catch {}
        }
      } catch {}
    }
    
    await scan(dirPath);
    
    // Sort by size descending
    largeFiles.sort((a, b) => b.size - a.size);
    
    // Calculate total
    const totalBytes = largeFiles.reduce((sum, f) => sum + f.size, 0);
    const totalGB = (totalBytes / (1024 * 1024 * 1024)).toFixed(2);
    
    return {
      files: largeFiles.slice(0, 20), // Limit for AI context
      totalSize: `${totalGB} GB in ${largeFiles.length} large files (>${minSizeMB}MB each)`
    };
  },

  async getDirectoryStats({ path: dirPath }: { path: string }): Promise<{
    totalFiles: number;
    totalFolders: number;
    totalSize: string;
    byType: Record<string, { count: number; size: number }>;
    oldest?: { name: string; date: string };
    newest?: { name: string; date: string };
  }> {
    type DateInfo = { name: string; date: number };
    let totalFiles = 0;
    let totalFolders = 0;
    let totalBytes = 0;
    const byType: Record<string, { count: number; size: number }> = {};
    // Use object wrapper to avoid TypeScript closure narrowing issues
    const tracker = { oldest: null as DateInfo | null, newest: null as DateInfo | null };
    
    async function scan(dir: string) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          try {
            const stats = await fs.stat(fullPath);
            if (entry.isDirectory()) {
              totalFolders++;
              await scan(fullPath);
            } else {
              totalFiles++;
              totalBytes += stats.size;
              
              // Track by extension
              const ext = path.extname(entry.name).toLowerCase().slice(1) || 'no extension';
              if (!byType[ext]) byType[ext] = { count: 0, size: 0 };
              byType[ext].count++;
              byType[ext].size += stats.size;
              
              // Track oldest/newest
              if (!tracker.oldest || stats.mtimeMs < tracker.oldest.date) {
                tracker.oldest = { name: entry.name, date: stats.mtimeMs };
              }
              if (!tracker.newest || stats.mtimeMs > tracker.newest.date) {
                tracker.newest = { name: entry.name, date: stats.mtimeMs };
              }
            }
          } catch {}
        }
      } catch {}
    }
    
    await scan(dirPath);
    
    // Format size
    const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);
    const totalGB = (totalBytes / (1024 * 1024 * 1024)).toFixed(2);
    const sizeStr = totalBytes > 1024 * 1024 * 1024 ? `${totalGB} GB` : `${totalMB} MB`;
    
    // Sort byType by count and limit to top 10
    const sortedTypes = Object.entries(byType)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .reduce((obj, [k, v]) => ({ ...obj, [k]: v }), {});
    
    // Copy from tracker object
    const oldestInfo = tracker.oldest;
    const newestInfo = tracker.newest;
    
    return {
      totalFiles,
      totalFolders,
      totalSize: sizeStr,
      byType: sortedTypes,
      oldest: oldestInfo ? { name: oldestInfo.name, date: new Date(oldestInfo.date).toLocaleDateString() } : undefined,
      newest: newestInfo ? { name: newestInfo.name, date: new Date(newestInfo.date).toLocaleDateString() } : undefined,
    };
  },

  async findDuplicates({ 
    path: dirPath, 
    method = 'size', 
    recursive = true 
  }: { 
    path: string; 
    method?: 'size' | 'name' | 'both'; 
    recursive?: boolean 
  }): Promise<{ groups: Array<{ key: string; files: string[] }>; totalDuplicates: number }> {
    const fileMap: Map<string, string[]> = new Map();
    
    async function scan(dir: string) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          try {
            if (entry.isDirectory()) {
              if (recursive) await scan(fullPath);
            } else {
              const stats = await fs.stat(fullPath);
              
              // Create key based on method
              let key: string;
              if (method === 'name') {
                key = entry.name.toLowerCase();
              } else if (method === 'both') {
                key = `${entry.name.toLowerCase()}_${stats.size}`;
              } else {
                key = `${stats.size}`; // size only
              }
              
              if (!fileMap.has(key)) fileMap.set(key, []);
              fileMap.get(key)!.push(fullPath);
            }
          } catch {}
        }
      } catch {}
    }
    
    await scan(dirPath);
    
    // Filter to only duplicates (2+ files with same key)
    const duplicates = Array.from(fileMap.entries())
      .filter(([_, files]) => files.length > 1)
      .map(([key, files]) => ({ key, files }))
      .sort((a, b) => b.files.length - a.files.length)
      .slice(0, 10); // Limit for AI context
    
    const totalDuplicates = duplicates.reduce((sum, g) => sum + g.files.length, 0);
    
    return { groups: duplicates, totalDuplicates };
  },

  async organizeByType({ 
    path: dirPath, 
    dryRun = true 
  }: { 
    path: string; 
    dryRun?: boolean 
  }): Promise<{ 
    moves: Array<{ from: string; to: string }>; 
    summary: Record<string, number>;
    executed: boolean;
  }> {
    // Category mappings
    const typeMap: Record<string, string> = {
      // Images
      jpg: 'Images', jpeg: 'Images', png: 'Images', gif: 'Images', 
      webp: 'Images', svg: 'Images', bmp: 'Images', ico: 'Images', heic: 'Images',
      // Documents  
      pdf: 'Documents', doc: 'Documents', docx: 'Documents', txt: 'Documents',
      rtf: 'Documents', odt: 'Documents', pages: 'Documents',
      // Spreadsheets
      xls: 'Spreadsheets', xlsx: 'Spreadsheets', csv: 'Spreadsheets', numbers: 'Spreadsheets',
      // Presentations
      ppt: 'Presentations', pptx: 'Presentations', key: 'Presentations',
      // Videos
      mp4: 'Videos', mov: 'Videos', avi: 'Videos', mkv: 'Videos', 
      wmv: 'Videos', flv: 'Videos', webm: 'Videos',
      // Audio
      mp3: 'Audio', wav: 'Audio', flac: 'Audio', aac: 'Audio', 
      ogg: 'Audio', m4a: 'Audio', wma: 'Audio',
      // Archives
      zip: 'Archives', rar: 'Archives', '7z': 'Archives', tar: 'Archives', 
      gz: 'Archives', dmg: 'Archives',
      // Code
      js: 'Code', ts: 'Code', py: 'Code', java: 'Code', cpp: 'Code', 
      c: 'Code', html: 'Code', css: 'Code', json: 'Code', xml: 'Code',
    };
    
    const moves: Array<{ from: string; to: string }> = [];
    const summary: Record<string, number> = {};
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) continue;
        
        const ext = path.extname(entry.name).toLowerCase().slice(1);
        const category = typeMap[ext] || 'Other';
        const fullPath = path.join(dirPath, entry.name);
        const destFolder = path.join(dirPath, category);
        const destPath = path.join(destFolder, entry.name);
        
        moves.push({ from: fullPath, to: destPath });
        summary[category] = (summary[category] || 0) + 1;
      }
      
      // Execute if not dry run
      if (!dryRun && moves.length > 0) {
        // Create category folders
        const folders = Array.from(new Set(moves.map(m => path.dirname(m.to))));
        for (const folder of folders) {
          await fs.mkdir(folder, { recursive: true });
        }
        // Move files
        for (const move of moves) {
          await fs.rename(move.from, move.to);
        }
      }
      
      return { moves: moves.slice(0, 20), summary, executed: !dryRun };
    } catch (error: any) {
      throw new Error(`Failed to organize: ${error.message}`);
    }
  },

  async organizeByDate({ 
    path: dirPath, 
    format = 'year-month',
    dryRun = true 
  }: { 
    path: string; 
    format?: 'year' | 'year-month' | 'year-month-day';
    dryRun?: boolean 
  }): Promise<{ 
    moves: Array<{ from: string; to: string }>; 
    summary: Record<string, number>;
    executed: boolean;
  }> {
    const moves: Array<{ from: string; to: string }> = [];
    const summary: Record<string, number> = {};
    
    const formatDate = (date: Date): string => {
      const y = date.getFullYear().toString();
      const m = (date.getMonth() + 1).toString().padStart(2, '0');
      const d = date.getDate().toString().padStart(2, '0');
      
      if (format === 'year') return y;
      if (format === 'year-month') return `${y}-${m}`;
      return `${y}-${m}-${d}`;
    };
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) continue;
        
        const fullPath = path.join(dirPath, entry.name);
        const stats = await fs.stat(fullPath);
        const dateFolder = formatDate(new Date(stats.mtimeMs));
        const destFolder = path.join(dirPath, dateFolder);
        const destPath = path.join(destFolder, entry.name);
        
        moves.push({ from: fullPath, to: destPath });
        summary[dateFolder] = (summary[dateFolder] || 0) + 1;
      }
      
      // Execute if not dry run
      if (!dryRun && moves.length > 0) {
        const folders = Array.from(new Set(moves.map(m => path.dirname(m.to))));
        for (const folder of folders) {
          await fs.mkdir(folder, { recursive: true });
        }
        for (const move of moves) {
          await fs.rename(move.from, move.to);
        }
      }
      
      return { moves: moves.slice(0, 20), summary, executed: !dryRun };
    } catch (error: any) {
      throw new Error(`Failed to organize: ${error.message}`);
    }
  },
};
