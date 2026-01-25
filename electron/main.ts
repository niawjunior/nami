import { app, BrowserWindow, ipcMain, screen, shell } from "electron";
import serve from "electron-serve";
import path from "path";
import { spawn } from "child_process";
import { startServer } from "./server";
import * as dotenv from 'dotenv';
import os from 'os';

// Explicitly load .env from the project root
dotenv.config({ path: path.join(__dirname, '../.env') });

// Security: Validate paths are within allowed directories
const isPathAllowed = (targetPath: string): boolean => {
    const home = os.homedir();
    const resolved = path.resolve(targetPath);
    // Allow paths within home directory only
    return resolved.startsWith(home);
};

// Set the app name for macOS menu bar
app.setName('Nami');

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
      const fs = require('fs').promises;
      const pathModule = require('path');
      try {
          const ext = pathModule.extname(filePath).toLowerCase().slice(1);
          const mimeTypes: Record<string, string> = {
              'png': 'image/png',
              'jpg': 'image/jpeg',
              'jpeg': 'image/jpeg',
              'gif': 'image/gif',
              'webp': 'image/webp',
              'bmp': 'image/bmp',
              'svg': 'image/svg+xml'
          };
          const mime = mimeTypes[ext] || 'application/octet-stream';
          const buffer = await fs.readFile(filePath);
          const base64 = buffer.toString('base64');
          return `data:${mime};base64,${base64}`;
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
  ipcMain.handle('get-folder-size', async (event, folderPath: string) => {
      if (!isPathAllowed(folderPath)) {
          throw new Error('Access denied: Path outside allowed directory');
      }
      const { fsTools } = require('./tools/fs');
      try {
          return await fsTools.calculateFolderSize({ path: folderPath });
      } catch (err: any) {
          console.error('Failed to calculate folder size:', err);
          return 0; // Return 0 on error
      }
  });

  // Get Directory Stats (Dashboard)
  ipcMain.handle('get-directory-stats', async (event, folderPath: string) => {
      if (!isPathAllowed(folderPath)) {
          throw new Error('Access denied: Path outside allowed directory');
      }
      const { fsTools } = require('./tools/fs');
      try {
          return await fsTools.getDirectoryStats({ path: folderPath });
      } catch (err: any) {
          console.error('Failed to get directory stats:', err);
          return { totalSize: 0, fileCount: 0, folderCount: 0, types: {} };
      }
  });

  // Search Content
  ipcMain.handle('search-content', async (event, args: { directory: string; query: string; extensions?: string[] }) => {
      if (!isPathAllowed(args.directory)) {
          throw new Error('Access denied: Path outside allowed directory');
      }
      const { fsTools } = require('./tools/fs');
      try {
          return await fsTools.searchContent(args);
      } catch (err: any) {
          console.error('Failed to search content:', err);
          return { matches: [], totalMatches: 0, searchedFiles: 0 };
      }
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
  
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
