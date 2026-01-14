"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const electron_serve_1 = __importDefault(require("electron-serve"));
const path_1 = __importDefault(require("path"));
const server_1 = require("./server");
const dotenv = __importStar(require("dotenv"));
const os_1 = __importDefault(require("os"));
// Explicitly load .env from the project root
dotenv.config({ path: path_1.default.join(__dirname, '../.env') });
// Security: Validate paths are within allowed directories
const isPathAllowed = (targetPath) => {
    const home = os_1.default.homedir();
    const resolved = path_1.default.resolve(targetPath);
    // Allow paths within home directory only
    return resolved.startsWith(home);
};
// Set the app name for macOS menu bar
electron_1.app.setName('Nami');
const appServe = (0, electron_serve_1.default)({ directory: path_1.default.join(__dirname, "../out") });
// Check if running in development mode
const isDev = process.env.NODE_ENV === 'development' || !electron_1.app.isPackaged && process.argv.includes('--dev');
let apiPort = 3001;
const createWindow = () => {
    const win = new electron_1.BrowserWindow({
        width: 1000,
        height: 800,
        titleBarStyle: "hidden",
        trafficLightPosition: { x: 18, y: 18 },
        webPreferences: {
            preload: path_1.default.join(__dirname, "preload.js"),
        },
    });
    if (isDev) {
        // Development mode - use Next.js dev server
        win.loadURL(`http://localhost:3000`);
        win.webContents.openDevTools();
        win.webContents.on("did-fail-load", (e, code, desc) => {
            win.webContents.reloadIgnoringCache();
        });
    }
    else {
        // Production mode - use static export
        appServe(win).then(() => {
            win.loadURL("app://-");
        });
    }
};
electron_1.app.on("ready", async () => {
    // Start the local AI server
    try {
        const { port } = await (0, server_1.startServer)();
        apiPort = port;
        console.log("Local Server started on port:", port);
    }
    catch (err) {
        console.error("Failed to start server:", err);
    }
    // Setup IPC for renderer to get the port
    electron_1.ipcMain.handle("get-api-port", () => apiPort);
    // Get Desktop path
    electron_1.ipcMain.handle('get-desktop-path', () => {
        const os = require('os');
        const path = require('path');
        return path.join(os.homedir(), 'Desktop');
    });
    electron_1.ipcMain.handle('open-path', async (event, targetPath) => {
        if (!isPathAllowed(targetPath)) {
            throw new Error('Access denied: Path outside allowed directory');
        }
        return await electron_1.shell.openPath(targetPath);
    });
    electron_1.ipcMain.handle('show-item-in-folder', async (event, targetPath) => {
        if (!isPathAllowed(targetPath)) {
            throw new Error('Access denied: Path outside allowed directory');
        }
        return electron_1.shell.showItemInFolder(targetPath);
    });
    electron_1.ipcMain.handle('read-text-file', async (event, filePath) => {
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
        }
        catch (err) {
            console.error('Failed to read text file:', err);
            return 'Failed to read file content.';
        }
    });
    electron_1.ipcMain.handle('read-image-as-base64', async (event, filePath) => {
        if (!isPathAllowed(filePath)) {
            throw new Error('Access denied: Path outside allowed directory');
        }
        const fs = require('fs').promises;
        const pathModule = require('path');
        try {
            const ext = pathModule.extname(filePath).toLowerCase().slice(1);
            const mimeTypes = {
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
        }
        catch (err) {
            console.error('Failed to read image:', err);
            return null;
        }
    });
    // Direct filesystem listing from renderer
    electron_1.ipcMain.handle('list-files', async (event, args) => {
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
        }
        catch (err) {
            console.error('Failed to list files:', err);
            return { success: false, error: err.message };
        }
    });
    // File Watcher
    let currentWatcher = null;
    const fs = require('fs');
    electron_1.ipcMain.handle('watch-directory', (event, targetPath) => {
        // Clean up previous watcher
        if (currentWatcher) {
            try {
                currentWatcher.close();
            }
            catch (e) { }
            currentWatcher = null;
        }
        if (!isPathAllowed(targetPath))
            return { success: false, error: 'Access denied' };
        try {
            // Watch for changes
            currentWatcher = fs.watch(targetPath, (eventType, filename) => {
                // specific file changes are hard to track cross-platform, so we just notify that SOMETHING changed
                // Debounce could be handled in renderer, or we just send it.
                // We send to the specific webContents that requested it
                event.sender.send('directory-changed', targetPath);
            });
            return { success: true };
        }
        catch (err) {
            console.error('Watch error:', err);
            return { success: false, error: err.message };
        }
    });
    createWindow();
});
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        electron_1.app.quit();
    }
});
