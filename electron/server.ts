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
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

const execAsync = util.promisify(exec);

const app = new Hono();

app.use('/*', cors());

app.post('/api/chat', async (c) => {
  try {
    const { messages, currentPath } = await c.req.json();

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
      system: getSystemPrompt(os.homedir(), currentPath),
      tools,
    });
    
    const dataStream = result.toUIMessageStreamResponse();
    return dataStream;

  } catch (e) {
      console.error(e);
      // @ts-ignore
      return c.json({ error: e.message }, 500);
  }
});

// Transcription Endpoint
app.post('/api/transcribe', async (c) => {
  try {
    // Check API Key
    if (!process.env.OPENAI_API_KEY) {
      return c.json({ error: 'OpenAI API key not configured' }, 500);
    }

    const body = await c.req.parseBody();
    const file = body['file'];

    if (!file || typeof file === 'string') {
      return c.json({ error: 'No audio file provided' }, 400);
    }

    // Save to temp file to ensure OpenAI SDK compatibility (it requires a ReadStream for fs)
    const buffer = await (file as any).arrayBuffer();
    const fileName = (file as any).name || 'audio.webm';
    const tempPath = path.join(os.tmpdir(), `nami_voice_${Date.now()}_${fileName}`);
    
    await fs.promises.writeFile(tempPath, Buffer.from(buffer));

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempPath),
      model: 'gpt-4o-transcribe', 
      language: 'th',
      prompt: "คำสั่งเสียงสำหรับจัดการไฟล์: Desktop, Documents, Downloads, Folder, Copy, Paste, Rename. เข้าไปยัง, ย้าย, ลบ. อย่าแปล TikTok.", 
    });

    // Cleanup temp file
    try {
      await fs.promises.unlink(tempPath);
    } catch (cleanupErr) {
      console.error('Failed to delete temp file:', cleanupErr);
    }

    let text = transcription.text.trim();

    // Filter known Whisper hallucinations (common in Thai/silence)
    // ALSO FILTER THE PROMPT ITSELF: If audio is silent, Whisper sometimes echoes the prompt.
    const hallucinations = [
      'โปรดติดตามตอนต่อไป',
      'ขอบคุณที่รับชม',
      'Subtitles by',
      'Amara.org',
      'คำสั่งเสียงสำหรับ', // Filter out prompt echoes
      'Manage files',
      'Desktop, Documents'
    ];

    if (hallucinations.some(h => text.includes(h))) {
        // If the text is MAINLY the hallucination, discard it
        // Check if length is similar or if it starts with it
        console.log('Filtered hallucination/prompt echo:', text);
        return c.json({ text: '' });
    }

    // Post-processing: Correct Thai Grammar & Technical Terms using GPT-4o
    if (text.length > 0) {
      try {
        const correctionCompletion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `You are Nami, a friendly female AI file manager assistant.
Your task is to correct Thai voice-to-text mistakes.
The audio often misinterprets English technical terms (like "Desktop") as Thai phonetics (like "เด็ดทอป" or "เจ็บท้อง" or "ตึกตี๊อก").

CRITICAL CORRECTIONS:
- "ตึกตี๊อก", "ติ๊กต๊อก", "TickTock" -> "Desktop" (Context: "บน ตึกตี๊อก" = "บน Desktop")
- "เข้าประยาง", "เข้าปะยาง" -> "เข้าไปยัง" (Go to / Enter)
- "เด็ดทอป", "เดสท็อป" -> "Desktop"
- "ฟูเดอร์", "โฟเดอ" -> "Folder"
- "ไฟล์", "ไฟ" -> "File"
- "แอพ", "แอป" -> "App"
- "ดุ๊กดิ๊ก" -> "Dock"

General Grammar:
- Ensure sentences sound natural for file management commands.
- Keep English technical terms in English.

Input Text: "${text}"
Output only the corrected text.`
            },
            {
              role: 'user',
              content: text
            }
          ],
          temperature: 0.1, 
        });

        const correctedText = correctionCompletion.choices[0].message.content?.trim();
        if (correctedText) {
            console.log(`[Voice] Original: "${text}" -> Corrected: "${correctedText}"`);
            text = correctedText;
        }
      } catch (correctionError) {
        console.error('Post-processing failed, using original text:', correctionError);
      }
    }

    return c.json({ text });

  } catch (error: any) {
    console.error('Transcription failed:', error);
    return c.json({ error: error.message || 'Transcription failed' }, 500);
  }
});

// Realtime API: Get ephemeral token for WebRTC session
app.get('/api/realtime/token', async (c) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return c.json({ error: 'OpenAI API key not configured' }, 500);
    }

    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview',
        voice: 'sage',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[Realtime] Token error:', error);
      return c.json({ error: 'Failed to get realtime token' }, 500);
    }

    const data = await response.json();
    console.log('[Realtime] Token obtained successfully');
    return c.json(data);

  } catch (error: any) {
    console.error('[Realtime] Token error:', error);
    return c.json({ error: error.message || 'Failed to get realtime token' }, 500);
  }
});

// Text-to-Speech Endpoint (plays audio directly on server using afplay)
app.post('/api/speak', async (c) => {
  try {
    // Check API Key
    if (!process.env.OPENAI_API_KEY) {
      return c.json({ error: 'OpenAI API key not configured' }, 500);
    }

    const { text, voice = 'sage', speed = 1.2 } = await c.req.json();

    if (!text || typeof text !== 'string') {
      return c.json({ error: 'No text provided' }, 400);
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    console.log(`[TTS] Speaking: "${text.substring(0, 50)}..."`);

    // Use WAV format for faster streaming
    const response = await openai.audio.speech.create({
      model: 'gpt-4o-mini-tts',
      voice: voice,
      input: text,
      response_format: 'wav',
      speed: speed,
      instructions: 'คุณคือหญิงสาวชาวไทยชื่อนามิ พูดด้วยน้ำเสียงหวาน นุ่มนวล น่าฟัง น้ำเสียงธรรมชาติ สุภาพ และเป็นผู้หญิง ใช้คำลงท้ายว่า "ค่ะ" ตอบแบบให้คำปรึกษา อธิบายชัดเจน ให้คำแนะนำอย่างรอบคอบ มีความเป็นมิตรและเป็นมืออาชีพ',
    });

    // Get audio buffer and save to temp file
    const audioBuffer = await response.arrayBuffer();
    const tempFile = path.join(os.tmpdir(), `tts-${Date.now()}.wav`);
    fs.writeFileSync(tempFile, Buffer.from(audioBuffer));
    
    // Play using macOS afplay (waits until done)
    await new Promise<void>((resolve, reject) => {
      exec(`afplay "${tempFile}"`, (error) => {
        // Clean up temp file
        try { fs.unlinkSync(tempFile); } catch {}
        
        if (error) {
          console.error('[TTS] afplay error:', error);
          reject(error);
        } else {
          resolve();
        }
      });
    });
    
    return c.json({ success: true });

  } catch (error: any) {
    console.error('TTS failed:', error);
    return c.json({ error: error.message || 'TTS failed' }, 500);
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
