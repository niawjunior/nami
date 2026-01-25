import { app, BrowserWindow, ipcMain, screen, shell } from "electron";
import serve from "electron-serve";
import path from "path";
import { spawn } from "child_process";
import { startServer } from "./server";
import * as dotenv from 'dotenv';
import os from 'os';

// Explicitly load .env from the project root or resources
const envPath = app.isPackaged 
    ? path.join(process.resourcesPath, '.env')
    : path.join(__dirname, '../.env');

dotenv.config({ path: envPath });

// Security: Validate paths are within allowed directories
const isPathAllowed = (targetPath: string): boolean => {
    const home = os.homedir();
    const resolved = path.resolve(targetPath);
    // Allow paths within home directory only
    return resolved.startsWith(home);
};

// Set the app name for macOS menu bar
app.setName('Nami');
// Performance: Disable default menu (article recommendation #8)
import { Menu } from 'electron';
Menu.setApplicationMenu(null);

const appServe = serve({ directory: path.join(__dirname, "../out") });

// Check if running in development mode
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged && process.argv.includes('--dev');

let apiPort: number = 3001;

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  if (isDev) {
    // Development mode - use Next.js dev server
    win.loadURL(`http://localhost:3000`);
    win.webContents.openDevTools();
    win.webContents.on("did-fail-load", (e, code, desc) => {
      win.webContents.reloadIgnoringCache();
    });
  } else {
    // Production mode - use static export
    appServe(win).then(() => {
      win.loadURL("app://-");
    });
  }
};

app.on("ready", async () => {
  // Start the local AI server
  try {
    const { port } = await startServer();
    apiPort = port;
    console.log("Local Server started on port:", port);
  } catch (err) {
    console.error("Failed to start server:", err);
  }

  // Setup IPC for renderer to get the port
  ipcMain.handle("get-api-port", () => apiPort);

  // Get Desktop path
  ipcMain.handle('get-desktop-path', () => {
      const os = require('os');
      const path = require('path');
      return path.join(os.homedir(), 'Desktop');
  });

  ipcMain.handle('open-path', async (event, targetPath: string) => {
      if (!isPathAllowed(targetPath)) {
          throw new Error('Access denied: Path outside allowed directory');
      }
      return await shell.openPath(targetPath);
  });

  ipcMain.handle('show-item-in-folder', async (event, targetPath: string) => {
      if (!isPathAllowed(targetPath)) {
          throw new Error('Access denied: Path outside allowed directory');
      }
      return shell.showItemInFolder(targetPath);
  });

  ipcMain.handle('read-text-file', async (event, filePath: string) => {
      if (!isPathAllowed(filePath)) {
          throw new Error('Access denied: Path outside allowed directory');
      }
      const fs = require('fs').promises;
      try {
          // Limit file size to 1MB for preview
          const stats = await fs.stat(filePath);
          if (stats.size > 1024 * 1024) {
              return 'File too large to preview (>1MB)';
          }
          const content = await fs.readFile(filePath, 'utf-8');
          return content;
      } catch (err) {
          console.error('Failed to read text file:', err);
          return 'Failed to read file content.';
      }
  });

  ipcMain.handle('read-image-as-base64', async (event, filePath: string) => {
      if (!isPathAllowed(filePath)) {
          throw new Error('Access denied: Path outside allowed directory');
      }
      const { nativeImage } = require('electron');
      try {
          // Try optimized thumbnail generation first (macOS/Windows)
          try {
              const thumb = await nativeImage.createThumbnailFromPath(filePath, { width: 256, height: 256 });
              return thumb.toDataURL();
          } catch (e) {
              // Fallback for unsupported formats or platforms
              // console.warn('Thumbnail generation failed, falling back to full read:', e);
              const img = nativeImage.createFromPath(filePath);
              if (img.isEmpty()) return null;
              return img.resize({ width: 256 }).toDataURL();
          }
      } catch (err) {
          console.error('Failed to read image:', err);
          return null;
      }
  });

  // Direct filesystem listing from renderer
  ipcMain.handle('list-files', async (event, args: { path: string; extensions?: string[] }) => {
      if (!isPathAllowed(args.path)) {
          return { success: false, error: 'Access denied: Path outside allowed directory' };
      }
      const { fsTools } = require('./tools/fs');
      try {
          const files = await fsTools.listFiles({
              path: args.path,
              extensions: args.extensions,
              sort: 'type' // Folders first, then files by name
          });
          return { success: true, files };
      } catch (err: any) {
          console.error('Failed to list files:', err);
          return { success: false, error: err.message };
      }
  });

  // Batch rename
  ipcMain.handle('batch-rename', async (event, operations: { original: string; new: string }[]) => {
      // Validate all paths
      for (const op of operations) {
          if (!isPathAllowed(op.original) || !isPathAllowed(op.new)) {
              return { success: [], errors: ['Access denied: Path outside allowed directory'] };
          }
      }
      
      const { fsTools } = require('./tools/fs');
      try {
          return await fsTools.batchRename(operations);
      } catch (err: any) {
          console.error('Failed to batch rename:', err);
          return { success: [], errors: [err.message] };
      }
  });

  // Calculate folder size
  // Calculate folder size (Worker Thread)
  ipcMain.handle('get-folder-size', async (event, folderPath: string) => {
      if (!isPathAllowed(folderPath)) {
          throw new Error('Access denied: Path outside allowed directory');
      }
      return new Promise((resolve, reject) => {
          const { Worker } = require('worker_threads');
          const workerPath = path.join(__dirname, 'tools/searchWorker.js');
          const worker = new Worker(workerPath);
          
          worker.on('message', (msg: any) => {
              if (msg.type === 'success') resolve(msg.results);
              else resolve(0);
              worker.terminate();
          });
          worker.on('error', (err: any) => {
              resolve(0);
              worker.terminate();
          });
          worker.postMessage({ type: 'size', payload: { path: folderPath } });
      });
  });

  // Get Directory Stats (Worker Thread)
  ipcMain.handle('get-directory-stats', async (event, folderPath: string) => {
      if (!isPathAllowed(folderPath)) {
          throw new Error('Access denied: Path outside allowed directory');
      }
      // Re-use worker logic (refactor if repeated often)
      return new Promise((resolve, reject) => {
          const { Worker } = require('worker_threads');
          const workerPath = path.join(__dirname, 'tools/searchWorker.js');
          const worker = new Worker(workerPath);
          
          worker.on('message', (msg: any) => {
              if (msg.type === 'success') resolve(msg.results);
              else {
                  console.error('Stats worker error:', msg.error);
                  resolve({ totalSize: 0, fileCount: 0, folderCount: 0, types: {} });
              }
              worker.terminate();
          });
          worker.on('error', (err: any) => {
              console.error('Stats worker unexpected error:', err);
              resolve({ totalSize: 0, fileCount: 0, folderCount: 0, types: {} });
              worker.terminate(); 
          });
          worker.postMessage({ type: 'stats', payload: { path: folderPath } });
      });
  });

  // Search Content (Worker Thread)
  ipcMain.handle('search-content', async (event, args: { directory: string; query: string; extensions?: string[] }) => {
      if (!isPathAllowed(args.directory)) {
          throw new Error('Access denied: Path outside allowed directory');
      }

      return new Promise((resolve, reject) => {
          const { Worker } = require('worker_threads');
          
          // Worker path depends on environment, but since we compile everything to 'dist',
          // it should be relative to this file (main.js)
          const workerPath = path.join(__dirname, 'tools/searchWorker.js');
          
          const worker = new Worker(workerPath);

          worker.on('message', (msg: any) => {
              if (msg.type === 'success') {
                  resolve(msg.results);
              } else {
                  console.error('Worker error:', msg.error);
                  resolve({ matches: [], totalMatches: 0, searchedFiles: 0 }); // Fail gracefully
              }
              worker.terminate();
          });

          worker.on('error', (err: Error) => {
              console.error('Worker thread error:', err);
              reject(err);
              worker.terminate();
          });

          worker.on('exit', (code: number) => {
              if (code !== 0) {
                  console.error(new Error(`Worker stopped with exit code ${code}`));
              }
          });

          // Send task
          worker.postMessage({ type: 'search', payload: args });
      });
  });

  // File Watcher
  let currentWatcher: any = null;
  const chokidar = require('chokidar');

  ipcMain.handle('watch-directory', async (event, targetPath: string) => {
      // Clean up previous watcher
      if (currentWatcher) {
          try {
              await currentWatcher.close();
          } catch(e) {}
          currentWatcher = null;
      }

      if (!isPathAllowed(targetPath)) return { success: false, error: 'Access denied' };

      try {
          // Watch for changes using Chokidar for robustness
          currentWatcher = chokidar.watch(targetPath, {
              ignored: [/(^|[\/\\])\../, '**/node_modules/**'], // Ignore dotfiles and node_modules
              persistent: true,
              depth: 1, // Only watch immediate directory for performance, or 0? 1 includes children.
              ignoreInitial: true, // Don't emit add events for existing files on startup
              awaitWriteFinish: { // Wait for writes to finish to avoid duplicate events
                  stabilityThreshold: 100,
                  pollInterval: 100
              }
          });

          // Send events
          const notifyChange = (path: string) => {
              // Debounced notification could be better, but for now simple relay
              try {
                if (!event.sender.isDestroyed()) {
                   event.sender.send('directory-changed', targetPath);
                }
              } catch (e) {
                  // Window might be closed
              }
          };

          currentWatcher
              .on('add', notifyChange)
              .on('change', notifyChange)
              .on('unlink', notifyChange)
              .on('addDir', notifyChange)
              .on('unlinkDir', notifyChange);

          return { success: true };
      } catch (err: any) {
          console.error('Watch error:', err);
          return { success: false, error: err.message };
      }
  });

  // --- Automation IPC ---
  
  ipcMain.handle('automation-get-rules', async () => {
      const { automation } = require('./tools/lib/automation');
      return automation.getRules();
  });

  ipcMain.handle('automation-save-rule', async (event, rule) => {
      const { automation } = require('./tools/lib/automation');
      return automation.saveRule(rule);
  });

  ipcMain.handle('automation-delete-rule', async (event, id) => {
      const { automation } = require('./tools/lib/automation');
      return automation.deleteRule(id);
  });

  ipcMain.handle('automation-toggle-rule', async (event, id, enabled) => {
      const { automation } = require('./tools/lib/automation');
      return automation.toggleRule(id, enabled);
  });

  ipcMain.handle('automation-get-status', async () => {
      const { automation } = require('./tools/lib/automation');
      return automation.getGlobalEnabled();
  });

  ipcMain.handle('automation-toggle-global', async (event, enabled) => {
      const { automation } = require('./tools/lib/automation');
      return automation.toggleGlobal(enabled);
  });
  
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
