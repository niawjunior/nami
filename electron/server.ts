import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { convertToModelMessages, streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { fsTools } from './tools/fs';
import { createAITools, getSystemPrompt } from './tools/definitions';
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
                          part.result = '... [Result too large, truncated for context efficiency]';
                      }
                 }
            }
        }
    }

    // Create AI tools with dependencies
    const tools = createAITools({
      fsTools,
      execAsync,
      shell,
      homedir: os.homedir(),
    });

    const result = streamText({
      model: openai('gpt-4o'),
      messages: coreMessages,
      // @ts-ignore
      experimental_toolCallConfirmation: true,
      system: getSystemPrompt(os.homedir()),
      tools,
    });
    
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
