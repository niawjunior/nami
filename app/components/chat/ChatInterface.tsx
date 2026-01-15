'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';
import { useEffect, useState, useRef, useCallback } from 'react';
import { Send, Sparkles, LayoutPanelLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileExplorer } from '../file-browser/FileExplorer';
import { ChatMessage, ChatMessageLoading } from './ChatMessage';
import { useFileSync } from './hooks/useFileSync';

// ============================================
// ChatSession - Main chat component
// ============================================
function ChatSession({ apiPort }: { apiPort: number }) {
  const [inputVal, setInputVal] = useState('');
  const [showExplorer, setShowExplorer] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // File state management via custom hook
  const {
    activeFiles,
    currentPath,
    activeFilters,
    handleNavigate,
    handleRefresh,
    handleClearFilters,
    loadDesktop,
    processAIMessage,
  } = useFileSync();

  // Use ref to always get latest currentPath in fetch (avoids stale closure)
  const currentPathRef = useRef(currentPath);
  useEffect(() => {
    currentPathRef.current = currentPath;
  }, [currentPath]);

  // Custom fetch that includes currentPath in the request body
  const customFetch = useCallback(async (url: string, options: RequestInit) => {
    // Parse the existing body and add currentPath from ref (always latest)
    const body = options.body ? JSON.parse(options.body as string) : {};
    body.currentPath = currentPathRef.current;
    
    return window.fetch(url, {
      ...options,
      body: JSON.stringify(body),
    });
  }, []); // No deps - uses ref for latest value

  // Chat hook with custom transport
  const { messages, sendMessage, status, addToolApprovalResponse } = useChat({
    transport: new DefaultChatTransport({
      api: `http://localhost:${apiPort}/api/chat`,
      fetch: customFetch as typeof window.fetch,
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onError: (err) => console.error('Chat error:', err),
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  // Process AI messages for file updates
  useEffect(() => {
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role === 'assistant') {
      processAIMessage(lastMsg);
    }
  }, [messages, processAIMessage]);

  // Load Desktop on mount
  useEffect(() => {
    loadDesktop();
  }, [loadDesktop]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-focus input on keydown
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Keep focus on input after sending
  useEffect(() => {
    if (!isLoading) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isLoading]);

  // Watch directory for changes
  useEffect(() => {
    if (currentPath) {
      window.electron.watchDirectory(currentPath);
    }
  }, [currentPath]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim() || isLoading) return;
    
    const content = inputVal;
    setInputVal('');
    
    await sendMessage({
      role: 'user',
      parts: [{ type: 'text', text: content }],
    });
  };

  return (
    <div className="flex h-full w-full overflow-hidden p-4 gap-4 pb-0 md:pb-4">
      {/* File Explorer Panel */}
      {showExplorer && (
        <div className="h-full shrink-0 w-[380px] border-r border-border/50">
          <FileExplorer 
            files={activeFiles} 
            currentPath={currentPath}
            className="h-full shadow-lg"
            activeFilters={activeFilters}
            onClearFilters={handleClearFilters}
            onNavigate={handleNavigate}
            onRefresh={handleRefresh}
          />
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full bg-card rounded-xl border border-border overflow-hidden shadow-sm relative transition-all min-w-0">
        
        {/* Toggle Button */}
        {!showExplorer && activeFiles.length > 0 && (
          <button 
            onClick={() => setShowExplorer(true)}
            className="absolute top-4 left-4 z-10 p-2 bg-secondary rounded-lg border border-border hover:bg-secondary/80 transition-colors no-drag"
            title="Show Files"
          >
            <LayoutPanelLeft size={16} />
          </button>
        )}
        
        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 p-4 scrollbar-thin scrollbar-thumb-primary/10">
          <AnimatePresence initial={false}>
            {/* Empty state */}
            {messages.length === 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center h-full text-center space-y-4 pt-10"
              >
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 ring-1 ring-primary/20">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight">How can I help you organize?</h2>
                <p className="text-muted-foreground max-w-md">
                  I can list files, read content, move, rename, and safely delete files for you.
                </p>
              </motion.div>
            )}
            
            {/* Message list */}
            {messages.map((m) => (
              <ChatMessage 
                key={m.id} 
                message={m} 
                addToolApprovalResponse={addToolApprovalResponse}
              />
            ))}

            {/* Loading indicator */}
            {isLoading && messages[messages.length - 1]?.role === 'user' && (
              <ChatMessageLoading />
            )}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="relative p-4 pt-2">
          <form onSubmit={handleSubmit} className="relative group">
            <input
              ref={inputRef}
              className="w-full bg-secondary border border-border rounded-xl px-4 py-4 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium placeholder:text-muted-foreground no-drag"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder="Describe a file task..."
            />
            <button
              type="submit"
              disabled={isLoading || !inputVal.trim()}
              className="absolute right-3 top-3 p-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20 no-drag"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ============================================
// ChatInterface - Main export (handles port loading)
// ============================================
export default function ChatInterface() {
  const [apiPort, setApiPort] = useState<number | null>(null);

  useEffect(() => {
    async function getPort() {
      if (typeof window !== 'undefined' && window.electron) {
        try {
          const port = await window.electron.getApiPort();
          setApiPort(port);
        } catch (err) {
          console.error('Failed to get API port:', err);
        }
      }
    }
    getPort();
  }, []);

  if (!apiPort) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground animate-pulse">
        <Sparkles className="w-5 h-5 mr-2" />
        Connecting to Nami Core...
      </div>
    );
  }

  return <ChatSession apiPort={apiPort} />;
}
