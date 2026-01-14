"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = startServer;
const node_server_1 = require("@hono/node-server");
const hono_1 = require("hono");
const cors_1 = require("hono/cors");
const ai_1 = require("ai");
const openai_1 = require("@ai-sdk/openai");
const zod_1 = require("zod");
const fs_1 = require("./tools/fs");
const get_port_1 = __importDefault(require("get-port"));
const os_1 = __importDefault(require("os"));
const child_process_1 = require("child_process");
const util_1 = __importDefault(require("util"));
const electron_1 = require("electron");
const execAsync = util_1.default.promisify(child_process_1.exec);
const app = new hono_1.Hono();
app.use('/*', (0, cors_1.cors)());
app.post('/api/chat', async (c) => {
    try {
        const { messages } = await c.req.json();
        // Validate API key is present
        if (!process.env.OPENAI_API_KEY) {
            return c.json({
                error: 'OpenAI API key not configured. Please add OPENAI_API_KEY to your .env file.'
            }, 500);
        }
        // Initialize OpenAI client
        const openai = (0, openai_1.createOpenAI)({
            apiKey: process.env.OPENAI_API_KEY,
        });
        // Convert UI messages (with 'parts') to Core messages (with 'content')
        const coreMessages = await (0, ai_1.convertToModelMessages)(messages);
        // Truncate large tool outputs to prevent context window overflow
        for (const m of coreMessages) {
            if (m.role === 'tool' && Array.isArray(m.content)) {
                for (const p of m.content) {
                    const part = p;
                    if (part.type === 'tool-result' && typeof part.result === 'string' && part.result.length > 1000) {
                        part.result = part.result.substring(0, 1000) + '... [TRUNCATED]';
                    }
                    // Handle object results (stringified)
                    if (part.type === 'tool-result' && typeof part.result === 'object') {
                        const str = JSON.stringify(part.result);
                        if (str.length > 1000) {
                            // Keep the structure but truncate content if possible, or just truncate string
                            part.result = '... [Result too large, truncated for context efficiency]';
                        }
                    }
                }
            }
        }
        const result = (0, ai_1.streamText)({
            model: openai('gpt-4o'),
            messages: coreMessages,
            // @ts-ignore
            experimental_toolCallConfirmation: true,
            maxSteps: 10, // Enable multi-step calls (required for approval flow)
            system: `You are Nami, an expert file organization AI agent.
      You have access to the user's local file system via tools.
      The user's home directory is: ${os_1.default.homedir()}
      
      RULES:
      1. ALWAYS verify the file listing before moving or deleting.
      2. Use the 'trashFile' tool for deletion requests (safety).
      3. **FILE MANAGER NAVIGATION**: 
          - Nami has a visual file manager sidebar that shows files.
          - **NAVIGATION**: When user says "go to", "navigate to", "show me", or "open" a FOLDER, use 'listFiles' to navigate the sidebar. Do NOT use 'openFile' for folders.
          - 'openFile' should ONLY be used to open FILES (not folders) in external apps (e.g., Preview, VS Code).
          - **NO TEXT DUPLICATION**: The UI shows file results. Do NOT list files again in text.
          - Common folders: ~/Desktop, ~/Downloads, ~/Documents
      4. **EFFICIENCY**:
          - **COUNTING**: For questions like "how many..." or "count files", use 'countFiles' tool. NEVER use 'listFiles' to count manually.
          - **VERIFICATION**: To check if a file/folder exists (e.g., "do I have a pdf folder?"), use 'checkFileExists'. Do NOT list all files.
          - **BATCH OPERATIONS**: When moving or deleting MULTIPLE files, ALWAYS use 'moveFiles' or 'trashFiles'. NEVER call single-file tools in a loop.
          - **READING**: When reading a specific file by name, use 'readFile' DIRECTLY without listing first.
          - **NAVIGATION**: Only use 'listFiles' when you need to NAVIGATE, FIND, or SHOW files.
      5. **ROBUSTNESS**: 
          - Use 'executeCommand' ONLY for internal tasks where NO content needs to be shown.
      6. Be concise and professional.
      `,
            tools: {
                listFiles: (0, ai_1.tool)({
                    description: 'List files in a directory. **ALWAYS USE THIS** to navigate, find, or show files. Supports filtering by type. Results are limited to 50 for efficiency.',
                    inputSchema: zod_1.z.object({
                        path: zod_1.z.string().describe('The absolute path to list'),
                        recursive: zod_1.z.boolean().optional().describe('Whether to list recursively'),
                        sort: zod_1.z.enum(['name', 'newest', 'oldest', 'type']).optional().describe('Sort order. Use "newest" for latest files.'),
                        extensions: zod_1.z.array(zod_1.z.string()).optional().describe('Filter by file extensions. E.g., ["pdf"] for PDFs, ["jpg", "png"] for images.'),
                    }),
                    execute: async (args) => {
                        const files = await fs_1.fsTools.listFiles(args);
                        const limit = 20; // Aggressive limit for AI context (UI uses separate IPC)
                        const totalCount = files.length;
                        const sliced = files.slice(0, limit);
                        // Return summary for AI instead of full list
                        return {
                            files: sliced,
                            totalCount,
                            truncated: totalCount > limit,
                            message: totalCount > limit
                                ? `Showing ${limit} of ${totalCount} files. Use filters to narrow down.`
                                : `Found ${totalCount} files.`
                        };
                    },
                }),
                countFiles: (0, ai_1.tool)({
                    description: 'Count files in a directory efficiently. **ALWAYS USE THIS** for questions like "how many files...", "count the PDFs...". Do NOT use listFiles for counting.',
                    inputSchema: zod_1.z.object({
                        path: zod_1.z.string().describe('The absolute path to count in'),
                        recursive: zod_1.z.boolean().optional().describe('Whether to count recursively'),
                        extensions: zod_1.z.array(zod_1.z.string()).optional().describe('Filter by file extensions'),
                    }),
                    execute: async (args) => {
                        const count = await fs_1.fsTools.countFiles(args);
                        return `Found ${count} files.`;
                    },
                }),
                checkFileExists: (0, ai_1.tool)({
                    description: 'Check if a specific file or folder exists. **ALWAYS USE THIS** to verify existence before creating, instead of listing all files.',
                    inputSchema: zod_1.z.object({
                        path: zod_1.z.string().describe('The absolute path to check'),
                    }),
                    execute: async ({ path }) => {
                        const exists = await fs_1.fsTools.checkFileExists({ path });
                        return exists ? `Yes, "${path}" exists.` : `No, "${path}" does not exist.`;
                    },
                }),
                readFile: (0, ai_1.tool)({
                    description: 'Read the content of a text file',
                    inputSchema: zod_1.z.object({
                        path: zod_1.z.string().describe('The absolute path to read'),
                    }),
                    execute: async (args) => fs_1.fsTools.readFile(args),
                }),
                openFile: (0, ai_1.tool)({
                    description: 'Open a FILE (not folder) in its default external application (e.g., Preview for PDF, VS Code for code). **For folder navigation, use listFiles instead.**',
                    inputSchema: zod_1.z.object({
                        path: zod_1.z.string().describe('The absolute path to open'),
                    }),
                    execute: async ({ path }) => {
                        const error = await electron_1.shell.openPath(path);
                        if (error)
                            throw new Error(error);
                        return `Opened ${path} successfully.`;
                    },
                }),
                moveFile: (0, ai_1.tool)({
                    description: 'Move or rename a SINGLE file. For multiple files, use moveFiles.',
                    inputSchema: zod_1.z.object({
                        source: zod_1.z.string().describe('The absolute source path'),
                        destination: zod_1.z.string().describe('The absolute destination path (full file path)'),
                    }),
                    // @ts-ignore
                    needsApproval: true,
                    execute: async (args) => fs_1.fsTools.moveFile(args),
                }),
                moveFiles: (0, ai_1.tool)({
                    description: 'Move MULTIPLE files to a destination folder. ALWAYS use this for batch operations.',
                    inputSchema: zod_1.z.object({
                        sources: zod_1.z.array(zod_1.z.string()).describe('List of absolute paths to move'),
                        destination: zod_1.z.string().describe('The destination FOLDER path'),
                    }),
                    // @ts-ignore
                    needsApproval: true,
                    execute: async (args) => fs_1.fsTools.moveFiles(args),
                }),
                trashFile: (0, ai_1.tool)({
                    description: 'Move a SINGLE file to trash. For multiple files, use trashFiles.',
                    inputSchema: zod_1.z.object({
                        path: zod_1.z.string().describe('The absolute path to trash'),
                    }),
                    // @ts-ignore
                    needsApproval: true,
                    execute: async (args) => fs_1.fsTools.trashFile(args),
                }),
                trashFiles: (0, ai_1.tool)({
                    description: 'Move MULTIPLE files to trash. ALWAYS use this for batch operations.',
                    inputSchema: zod_1.z.object({
                        paths: zod_1.z.array(zod_1.z.string()).describe('List of absolute paths to trash'),
                    }),
                    // @ts-ignore
                    needsApproval: true,
                    execute: async (args) => fs_1.fsTools.trashFiles(args),
                }),
                createDirectory: (0, ai_1.tool)({
                    description: 'Create a new directory',
                    inputSchema: zod_1.z.object({
                        path: zod_1.z.string().describe('The absolute path to create'),
                    }),
                    // @ts-ignore
                    needsApproval: true,
                    execute: async (args) => {
                        console.log('EXECUTING createDirectory (Approval Passed or Ignored)', args);
                        return fs_1.fsTools.createDirectory(args);
                    },
                }),
                // Terminal Tool
                executeCommand: (0, ai_1.tool)({
                    description: 'Execute a shell command. Use for git, npm, brew, etc. **DO NOT USE for listing files (ls, find)** -> Use "listFiles" instead so the user can see them in the UI.',
                    inputSchema: zod_1.z.object({
                        command: zod_1.z.string().describe('The shell command to execute'),
                    }),
                    execute: async ({ command }) => {
                        const lowerCmd = command.trim().toLowerCase();
                        if (lowerCmd.startsWith('ls') || lowerCmd.startsWith('find')) {
                            throw new Error("UI VISUALIZATION REQUIRED: You are NOT allowed to use 'ls' or 'find' in the terminal. You MUST use the 'listFiles' tool so the user can see the files in the UI.");
                        }
                        try {
                            const { stdout, stderr } = await execAsync(command, { cwd: os_1.default.homedir() });
                            if (stderr) {
                                return `Output: ${stdout}\nError: ${stderr}`;
                            }
                            return stdout || 'Command executed successfully with no output.';
                        }
                        catch (error) {
                            return `Command failed: ${error.message}`;
                        }
                    },
                }),
            },
        });
        // Log available methods to debug
        // console.log('StreamText Result keys:', Object.keys(result));
        // Manually construct response using the data stream
        const dataStream = result.toUIMessageStreamResponse();
        return dataStream;
    }
    catch (e) {
        console.error(e);
        // @ts-ignore
        return c.json({ error: e.message }, 500);
    }
});
async function startServer() {
    const port = await (0, get_port_1.default)({ port: 3001 });
    console.log(`Starting Nami AI Server on port ${port}`);
    const server = (0, node_server_1.serve)({
        fetch: app.fetch,
        port,
    });
    return { port, server };
}
