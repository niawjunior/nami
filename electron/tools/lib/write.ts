import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import trash from 'trash';

export const writeTools = {
  async moveFile({ source, destination }: { source: string; destination: string }) {
    try {
      await fs.rename(source, destination);
      return `Moved ${source} to ${destination}`;
    } catch (error: any) {
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
    } catch (error: any) {
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

  async trashByPattern({ 
    directory, 
    pattern, 
    extensions,
    recursive = false
  }: { 
    directory: string; 
    pattern: string; 
    extensions?: string[];
    recursive?: boolean;
  }): Promise<{ count: number; files: string[] }> {
    try {
      const filesToTrash: string[] = [];
      const regex = new RegExp(pattern.replace(/\*/g, '.*'), 'i');
      
      if (recursive) {
        // Use glob for recursive search
        const globPattern = '**/*';
        const allFiles = await glob(globPattern, { 
          cwd: directory, 
          nodir: true,
          ignore: ['**/node_modules/**', '**/.git/**']
        });
        
        for (const file of allFiles) {
          const basename = path.basename(file);
          if (!regex.test(basename)) continue;
          
          if (extensions && extensions.length > 0) {
            const ext = path.extname(basename).toLowerCase().slice(1);
            if (!extensions.includes(ext)) continue;
          }
          
          filesToTrash.push(path.join(directory, file));
        }
      } else {
        // Non-recursive: just the immediate directory
        const entries = await fs.readdir(directory, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.isDirectory()) continue;
          if (!regex.test(entry.name)) continue;
          
          if (extensions && extensions.length > 0) {
            const ext = path.extname(entry.name).toLowerCase().slice(1);
            if (!extensions.includes(ext)) continue;
          }
          
          filesToTrash.push(path.join(directory, entry.name));
        }
      }
      
      if (filesToTrash.length === 0) {
        return { count: 0, files: [] };
      }
      
      await trash(filesToTrash);
      return { 
        count: filesToTrash.length, 
        files: filesToTrash.slice(0, 10).map(f => path.basename(f))
      };
    } catch (error: any) {
      throw new Error(`Failed to trash by pattern: ${error.message}`);
    }
  },
  
  async createDirectory({ path: dirPath }: { path: string }) {
      try {
          await fs.mkdir(dirPath, { recursive: true });
          return `Created directory ${dirPath}`;
      } catch (error: any) {
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
