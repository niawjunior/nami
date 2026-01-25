import { parentPort, workerData } from 'worker_threads';
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import mammoth from 'mammoth';

// Polyfills if needed (DOM for some libs?)
const globalAny: any = global;
globalAny.window = globalAny.window || {};
globalAny.document = globalAny.document || {
    createElement: () => ({}),
    createElementNS: () => ({})
};

// Lazy load pdf-parse
let pdf: any;
try {
    pdf = require('pdf-parse');
} catch (e) {
    // console.error('Worker: Failed to load pdf-parse');
}

parentPort?.on('message', async (task) => {
    if (task.type === 'search') {
        try {
            const results = await searchContent(task.payload);
            parentPort?.postMessage({ type: 'success', results });
        } catch (error: any) {
            parentPort?.postMessage({ type: 'error', error: error.message });
        }
    }
});

interface SearchOptions {
    directory: string; 
    query: string;
    extensions?: string[];
    caseSensitive?: boolean;
    maxResults?: number;
}

async function searchContent({ 
  directory, 
  query, 
  extensions,
  caseSensitive = false,
  maxResults = 20 
}: SearchOptions) {
    const matches: Array<{ file: string; preview: string; lineNumber?: number }> = [];
    let searchedFiles = 0;
    
    // Default to common text/document extensions
    const searchExtensions = extensions || ['txt', 'md', 'json', 'js', 'ts', 'py', 'pdf', 'docx', 'html', 'css', 'log', 'csv'];
    
    // 1. Scan files (Inline glob logic to avoid dependency on FileSystemScanner class if tricky to import)
    // Borrowed simplified scanning
    let globPattern = '**/*';
    if (searchExtensions && searchExtensions.length > 0) {
      const extPattern = searchExtensions.length === 1 
        ? searchExtensions[0] 
        : `{${searchExtensions.join(',')}}`;
      globPattern = `**/*.${extPattern}`;
    }

    try {
        const files = await glob(globPattern, {
            cwd: directory,
            dot: false,
            ignore: ['**/node_modules/**', '**/.git/**', '**/.DS_Store'],
            absolute: true 
        });

        const searchRegex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi');

        for (const filePath of files) {
            if (matches.length >= maxResults) break;
            
            const ext = path.extname(filePath).toLowerCase().slice(1);
            searchedFiles++;
            
            try {
                let content = '';
                
                // Read content based on file type
                if (ext === 'pdf' && pdf) {
                    const buffer = await fs.readFile(filePath);
                    const data = await pdf(buffer);
                    content = data.text;
                } else if (ext === 'docx') {
                    const buffer = await fs.readFile(filePath);
                    const result = await mammoth.extractRawText({ buffer });
                    content = result.value;
                } else {
                    // Text file - read directly
                    const stats = await fs.stat(filePath);
                    if (stats.size > 5 * 1024 * 1024) continue; // Skip files > 5MB
                    content = await fs.readFile(filePath, 'utf-8');
                }
                
                // Search for matches
                const lines = content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    if (searchRegex.test(lines[i])) {
                        // Get context around match
                        const preview = lines[i].trim().substring(0, 150) + (lines[i].length > 150 ? '...' : '');
                        matches.push({
                            file: filePath,
                            preview,
                            lineNumber: ext === 'pdf' || ext === 'docx' ? undefined : i + 1
                        });
                        
                        if (matches.length >= maxResults) break;
                    }
                    searchRegex.lastIndex = 0; // Reset regex state
                }
            } catch (err) {
                // Skip files that can't be read
                continue;
            }
        }
        
        return {
            matches,
            totalMatches: matches.length,
            searchedFiles
        };

    } catch (error: any) {
        throw new Error(`Worker Search failed: ${error.message}`);
    }
}
