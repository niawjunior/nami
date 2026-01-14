import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { convertToModelMessages, streamText, tool, stepCountIs } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { fsTools } from './tools/fs';
import getPort from 'get-port';
import os from 'os';
import { exec } from 'child_process';
import util from 'util';
import { shell } from 'electron';

const execAsync = util.promisify(exec);

const app = new Hono();

app.use('/*', cors());

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
    const openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Convert UI messages (with 'parts') to Core messages (with 'content')
    const coreMessages = await convertToModelMessages(messages);
    
    // Truncate large tool outputs to prevent context window overflow
    for (const m of coreMessages) {
        if (m.role === 'tool' && Array.isArray(m.content)) {
            for (const p of m.content) {
                 const part = p as any;
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
    


    const result = streamText({
      model: openai('gpt-4o'),
      messages: coreMessages,
      // @ts-ignore
      experimental_toolCallConfirmation: true,
      maxSteps: 10, // Enable multi-step calls (required for approval flow)
      system: `You are Nami, an expert file organization AI agent.
      You have access to the user's local file system via tools.
      The user's home directory is: ${os.homedir()}
      
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
          - **BATCH OPERATIONS**: When moving, copying, or deleting MULTIPLE files, ALWAYS use batch tools (moveFiles, copyFiles, trashFiles). NEVER call single-file tools in a loop.
          - **READING**: When reading a specific file by name, use 'readFile' DIRECTLY without listing first.
          - **NAVIGATION**: Only use 'listFiles' when you need to NAVIGATE, FIND, or SHOW files.
      5. **SHELL COMMANDS (executeCommand)**:
          - Use for: git, npm, brew, disk usage (du -sh), file info (stat), zip/unzip, clipboard (pbcopy/pbpaste)
          - NEVER use for: ls, find (use listFiles instead), rm -rf, sudo, or dangerous commands.
          - Examples: "git status", "du -sh ~/Downloads", "zip -r archive.zip folder", "stat file.txt"
      6. Be concise and professional.
      `,
      tools: {
        listFiles: tool({
          description: 'List files in a directory. **ALWAYS USE THIS** to navigate, find, or show files. Supports filtering by type. Results are limited to 50 for efficiency.',
          inputSchema: z.object({
            path: z.string().describe('The absolute path to list'),
            recursive: z.boolean().optional().describe('Whether to list recursively'),
            sort: z.enum(['name', 'newest', 'oldest', 'type']).optional().describe('Sort order. Use "newest" for latest files.'),
            extensions: z.array(z.string()).optional().describe('Filter by file extensions. E.g., ["pdf"] for PDFs, ["jpg", "png"] for images.'),
          }),
          execute: async (args) => {
              const files = await fsTools.listFiles(args);
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

        countFiles: tool({
            description: 'Count files in a directory efficiently. **ALWAYS USE THIS** for questions like "how many files...", "count the PDFs...". Do NOT use listFiles for counting.',
            inputSchema: z.object({
                path: z.string().describe('The absolute path to count in'),
                recursive: z.boolean().optional().describe('Whether to count recursively'),
                extensions: z.array(z.string()).optional().describe('Filter by file extensions'),
            }),
            execute: async (args) => {
                const count = await fsTools.countFiles(args);
                return `Found ${count} files.`;
            },
        }),
        checkFileExists: tool({
            description: 'Check if a specific file or folder exists. **ALWAYS USE THIS** to verify existence before creating, instead of listing all files.',
            inputSchema: z.object({
                path: z.string().describe('The absolute path to check'),
            }),
            execute: async ({ path }) => {
                const exists = await fsTools.checkFileExists({ path });
                return exists ? `Yes, "${path}" exists.` : `No, "${path}" does not exist.`;
            },
        }),
        readFile: tool({
          description: 'Read the content of a text file',
          inputSchema: z.object({
            path: z.string().describe('The absolute path to read'),
          }),
          execute: async (args) => fsTools.readFile(args),
        }),
        openFile: tool({
            description: 'Open a FILE (not folder) in its default external application (e.g., Preview for PDF, VS Code for code). **For folder navigation, use listFiles instead.**',
            inputSchema: z.object({
                path: z.string().describe('The absolute path to open'),
            }),
            execute: async ({ path }) => {
                const error = await shell.openPath(path);
                if (error) throw new Error(error);
                return `Opened ${path} successfully.`;
            },
        }),
        moveFile: tool({
          description: 'Move or rename a SINGLE file. For multiple files, use moveFiles.',
          inputSchema: z.object({
            source: z.string().describe('The absolute source path'),
            destination: z.string().describe('The absolute destination path (full file path)'),
          }),
          // @ts-ignore
          needsApproval: true,
          execute: async (args: { source: string; destination: string }) => fsTools.moveFile(args),
        } as any),
        moveFiles: tool({
            description: 'Move MULTIPLE files to a destination folder. ALWAYS use this for batch operations.',
            inputSchema: z.object({
                sources: z.array(z.string()).describe('List of absolute paths to move'),
                destination: z.string().describe('The destination FOLDER path'),
            }),
             // @ts-ignore
            needsApproval: true,
            execute: async (args: { sources: string[]; destination: string }) => fsTools.moveFiles(args),
        } as any),
        trashFile: tool({
            description: 'Move a SINGLE file to trash. For multiple files, use trashFiles.',
            inputSchema: z.object({
                path: z.string().describe('The absolute path to trash'),
            }),
             // @ts-ignore
            needsApproval: true,
            execute: async (args: { path: string }) => fsTools.trashFile(args),
        } as any),
        trashFiles: tool({
            description: 'Move MULTIPLE files to trash. ALWAYS use this for batch operations.',
            inputSchema: z.object({
                paths: z.array(z.string()).describe('List of absolute paths to trash'),
            }),
             // @ts-ignore
            needsApproval: true,
            execute: async (args: { paths: string[] }) => fsTools.trashFiles(args),
        } as any),
         createDirectory: tool({
          description: 'Create a new directory',
          inputSchema: z.object({
            path: z.string().describe('The absolute path to create'),
          }),
          // @ts-ignore
          needsApproval: true,
          execute: async (args: { path: string }) => {
              console.log('EXECUTING createDirectory (Approval Passed or Ignored)', args);
              return fsTools.createDirectory(args);
          },
        } as any),
        copyFile: tool({
          description: 'Copy a SINGLE file to a new location. For multiple files, use copyFiles.',
          inputSchema: z.object({
            source: z.string().describe('The absolute source file path'),
            destination: z.string().describe('The absolute destination path (full file path including name)'),
          }),
          // @ts-ignore
          needsApproval: true,
          execute: async (args: { source: string; destination: string }) => fsTools.copyFile(args),
        } as any),
        copyFiles: tool({
            description: 'Copy MULTIPLE files to a destination folder. ALWAYS use this for batch copy operations.',
            inputSchema: z.object({
                sources: z.array(z.string()).describe('List of absolute file paths to copy'),
                destination: z.string().describe('The destination FOLDER path'),
            }),
             // @ts-ignore
            needsApproval: true,
            execute: async (args: { sources: string[]; destination: string }) => fsTools.copyFiles(args),
        } as any),
        // Terminal Tool - REQUIRES APPROVAL for safety
        executeCommand: tool({
           description: 'Execute a shell command. Use for git, npm, brew, disk usage (du), file info (stat), zip/unzip, etc. **DO NOT USE for listing files (ls, find)** -> Use "listFiles" instead.',
           inputSchema: z.object({
             command: z.string().describe('The shell command to execute'),
           }),
           // @ts-ignore
           needsApproval: true,
           execute: async (args: { command: string }) => {
             const { command } = args;
             const lowerCmd = command.trim().toLowerCase();
             
             // Block dangerous commands
             const blocklist = ['rm -rf', 'sudo', 'chmod 777', '> /dev/', 'mkfs', 'dd if='];
             for (const blocked of blocklist) {
               if (lowerCmd.includes(blocked)) {
                 throw new Error(`Blocked dangerous command pattern: "${blocked}". Use safer alternatives.`);
               }
             }
             
             // Block ls/find (use listFiles instead for UI)
             if (lowerCmd.startsWith('ls') || lowerCmd.startsWith('find')) {
                 throw new Error("UI VISUALIZATION REQUIRED: Use 'listFiles' tool instead so files appear in the UI.");
             }

             try {
               const { stdout, stderr } = await execAsync(command, { cwd: os.homedir() });
               if (stderr) {
                 return `Output: ${stdout}\nError: ${stderr}`;
               }
               return stdout || 'Command executed successfully with no output.';
             } catch (error: any) {
               return `Command failed: ${error.message}`;
             }
           },
        } as any),
      },
    });
    
    // Log available methods to debug
    // console.log('StreamText Result keys:', Object.keys(result));

    // Manually construct response using the data stream
    const dataStream = result.toUIMessageStreamResponse();
    return dataStream;

  } catch (e) {
      console.error(e);
      // @ts-ignore
      return c.json({ error: e.message }, 500);
  }
});

export async function startServer() {
  const port = await getPort({ port: 3001 });
  console.log(`Starting Nami AI Server on port ${port}`);
  
  const server = serve({
    fetch: app.fetch,
    port,
  });
  
  return { port, server };
}
