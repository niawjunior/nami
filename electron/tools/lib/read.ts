import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { FileEntry } from './types';
import { polyfillDOM } from './utils';

// Initialize PDF support
polyfillDOM();

// @ts-ignore
let pdf: any;
try {
  pdf = require('pdf-parse');
} catch (e) {
  console.error('Failed to load pdf-parse:', e);
}

import { FileSystemScanner } from './scanner';

export const readTools = {
  // Efficiently count files matching criteria
  async countFiles({ path: dirPath, recursive = false, extensions, pattern }: { 
    path: string; 
    recursive?: boolean; 
    extensions?: string[];
    pattern?: string;
  }): Promise<number> {
    try {
       const files = await FileSystemScanner.scan({
           path: dirPath,
           recursive,
           extensions,
           pattern
       });
       return files.length;
    } catch (error) {
      console.error('Error counting files:', error);
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
    try {
      // Use efficient scanner
      const filePaths = await FileSystemScanner.scan({
          path: dirPath, 
          recursive, 
          extensions 
      });

      const files: FileEntry[] = await Promise.all(
        filePaths.map(async (filePath) => {
          try {
            const stats = await fs.stat(filePath);
            return {
              name: path.basename(filePath),
              path: filePath,
              isDirectory: stats.isDirectory(),
              size: stats.size,
              lastModified: stats.mtimeMs,
            };
          } catch {
            return null;
          }
        })
      ).then(results => results.filter((f): f is FileEntry => f !== null));

      // Sorting
      return files.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;

        switch (sort) {
          case 'newest': return b.lastModified - a.lastModified;
          case 'oldest': return a.lastModified - b.lastModified;
          case 'type': {
             const extA = path.extname(a.name).toLowerCase();
             const extB = path.extname(b.name).toLowerCase();
             return extA.localeCompare(extB);
          }
          case 'name':
          default:
            return a.name.localeCompare(b.name);
        }
      });
    } catch (error) {
      console.error('Error listing files:', error);
      return [];
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
    } catch (error: any) {
      throw new Error(`Failed to read file: ${error.message}`);
    }
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
};
