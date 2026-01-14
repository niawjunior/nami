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
exports.fsTools = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const trash_1 = __importDefault(require("trash"));
const glob_1 = require("glob");
const os_1 = __importDefault(require("os"));
// Polyfill DOM elements for pdf-parse in Node context
const polyfillDOM = () => {
    if (typeof global.DOMMatrix === 'undefined') {
        // @ts-ignore
        global.DOMMatrix = class DOMMatrix {
            constructor() { }
            translate() { return this; }
            scale() { return this; }
            multiply() { return this; }
            transformPoint(p) { return p; }
            inverse() { return this; }
        };
    }
    if (typeof global.ImageData === 'undefined') {
        // @ts-ignore
        global.ImageData = class ImageData {
            constructor(data, w, h) { }
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
let pdf;
try {
    pdf = require('pdf-parse');
}
catch (e) {
    console.error('Failed to load pdf-parse:', e);
}
const mammoth_1 = __importDefault(require("mammoth"));
const XLSX = __importStar(require("xlsx"));
exports.fsTools = {
    // Efficiently count files matching criteria
    async countFiles({ path: dirPath, recursive = false, extensions }) {
        try {
            const pattern = recursive ? '**/*' : '*';
            const files = await (0, glob_1.glob)(pattern, {
                cwd: dirPath,
                nodir: true,
                ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**']
            });
            if (!extensions || extensions.length === 0)
                return files.length;
            const normalizedExts = extensions.map(e => e.toLowerCase().replace(/^\./, ''));
            return files.filter(f => {
                const ext = path_1.default.extname(f).toLowerCase().slice(1);
                return normalizedExts.includes(ext);
            }).length;
        }
        catch (error) {
            return 0;
        }
    },
    async checkFileExists({ path: filePath }) {
        try {
            await promises_1.default.access(filePath);
            return true;
        }
        catch {
            return false;
        }
    },
    async listFiles({ path: dirPath, recursive = false, sort = 'name', extensions }) {
        if (recursive && dirPath === os_1.default.homedir()) {
            throw new Error("Recursive search of Home Directory is blocked for safety. Please target a specific folder (e.g. Desktop, Downloads).");
        }
        // Normalize extensions (remove leading dots, lowercase)
        const normalizedExtensions = extensions?.map(ext => ext.replace(/^\./, '').toLowerCase());
        try {
            let allFiles = [];
            let rawFiles = [];
            if (recursive) {
                const globFiles = await (0, glob_1.glob)('**/*', {
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
            }
            else {
                const entries = await promises_1.default.readdir(dirPath, { withFileTypes: true });
                rawFiles = await Promise.all(entries.map(async (entry) => {
                    const fullPath = path_1.default.join(dirPath, entry.name);
                    let stats;
                    try {
                        stats = await promises_1.default.stat(fullPath);
                    }
                    catch (e) { }
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
                }
                else if (sort === 'oldest') {
                    rawFiles.sort((a, b) => (a.stats?.mtimeMs || 0) - (b.stats?.mtimeMs || 0));
                }
                else if (sort === 'type') {
                    rawFiles.sort((a, b) => {
                        if (a.isDirectory === b.isDirectory)
                            return a.name.localeCompare(b.name);
                        return a.isDirectory ? -1 : 1;
                    });
                }
                else {
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
                    if (f.isDirectory)
                        return false; // Exclude directories when filtering by extension
                    const ext = f.name.split('.').pop()?.toLowerCase();
                    return ext && normalizedExtensions.includes(ext);
                });
            }
            // Return all files (no limit needed for native file browser)
            return allFiles;
        }
        catch (error) {
            // @ts-ignore
            throw new Error(`Failed to list files: ${error.message}`);
        }
    },
    async readFile({ path: filePath }) {
        try {
            const ext = path_1.default.extname(filePath).toLowerCase();
            if (ext === '.pdf') {
                if (!pdf) {
                    console.error('PDF module not loaded. Attempting to load...');
                    try {
                        pdf = require('pdf-parse');
                    }
                    catch (e) {
                        throw new Error('PDF support is not available. The pdf-parse module could not be loaded.');
                    }
                }
                try {
                    const dataBuffer = await promises_1.default.readFile(filePath);
                    const data = await pdf(dataBuffer);
                    return data.text || 'PDF text extraction returned empty content.';
                }
                catch (pdfErr) {
                    console.error('PDF parsing error:', pdfErr);
                    throw new Error(`Failed to parse PDF: ${pdfErr.message}`);
                }
            }
            if (ext === '.docx') {
                const buffer = await promises_1.default.readFile(filePath);
                const result = await mammoth_1.default.extractRawText({ buffer });
                return result.value;
            }
            if (ext === '.xlsx' || ext === '.xls') {
                const buffer = await promises_1.default.readFile(filePath);
                const workbook = XLSX.read(buffer, { type: 'buffer' });
                let content = '';
                workbook.SheetNames.forEach(sheetName => {
                    const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
                    content += `--- Sheet: ${sheetName} ---\n${csv}\n\n`;
                });
                return content;
            }
            // Default to text/utf-8
            const content = await promises_1.default.readFile(filePath, 'utf-8');
            return content;
        }
        catch (error) {
            // @ts-ignore
            throw new Error(`Failed to read file: ${error.message}`);
        }
    },
    async moveFile({ source, destination }) {
        try {
            await promises_1.default.rename(source, destination);
            return `Moved ${source} to ${destination}`;
        }
        catch (error) {
            // @ts-ignore
            throw new Error(`Failed to move file: ${error.message}`);
        }
    },
    async moveFiles({ sources, destination }) {
        try {
            await promises_1.default.mkdir(destination, { recursive: true });
            const results = [];
            const errors = [];
            for (const src of sources) {
                // Check if source exists
                try {
                    await promises_1.default.access(src);
                }
                catch {
                    errors.push(`${src} not found`);
                    continue;
                }
                const fileName = path_1.default.basename(src);
                const destPath = path_1.default.join(destination, fileName);
                try {
                    await promises_1.default.rename(src, destPath);
                    results.push(src);
                }
                catch (err) {
                    errors.push(`${src}: ${err.message}`);
                }
            }
            if (errors.length > 0 && results.length === 0) {
                throw new Error(`Failed to move files: ${errors.join(', ')}`);
            }
            return `Moved ${results.length} files to ${destination}. ${errors.length > 0 ? `Errors: ${errors.join(', ')}` : ''}`;
        }
        catch (error) {
            throw new Error(`Batch move failed: ${error.message}`);
        }
    },
    async trashFile({ path: filePath }) {
        try {
            await (0, trash_1.default)(filePath);
            return `Moved ${filePath} to trash`;
        }
        catch (error) {
            // @ts-ignore
            throw new Error(`Failed to trash file: ${error.message}`);
        }
    },
    async trashFiles({ paths }) {
        try {
            await (0, trash_1.default)(paths);
            return `Moved ${paths.length} files to trash`;
        }
        catch (error) {
            throw new Error(`Failed to trash files: ${error.message}`);
        }
    },
    async createDirectory({ path: dirPath }) {
        try {
            await promises_1.default.mkdir(dirPath, { recursive: true });
            return `Created directory ${dirPath}`;
        }
        catch (error) {
            // @ts-ignore
            throw new Error(`Failed to create directory: ${error.message}`);
        }
    }
};
