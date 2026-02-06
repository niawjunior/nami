'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';
import { useEffect, useState, useRef, useCallback } from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FileExplorer } from '../file-browser/FileExplorer';
import { ChatMessage, ChatMessageLoading } from './ChatMessage';
import { useFileSync } from './hooks/useFileSync';
import { useChatStorage, StoredMessage } from './hooks/useChatStorage';
import { HistorySidebar } from './HistorySidebar';
import { ChatHeaderControls } from './ChatHeaderControls';
import { ChatInputArea } from './ChatInputArea';
import { ChatWelcomeScreen } from './ChatWelcomeScreen';
import { AutomationPanel } from '../automation/AutomationPanel';
import VisualProjectMap from '../visual/VisualProjectMap';
import { useVoiceControl } from '../voice/VoiceControlProvider';

// ... (existing imports)

function ChatSession({ apiPort }: { apiPort: number }) {
  const [inputVal, setInputVal] = useState('');
  const [viewMode, setViewMode] = useState<'chat' | 'visual'>('chat');
  const [showExplorer, setShowExplorer] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [showAutomation, setShowAutomation] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Chat persistence
  const {
    conversations,
    currentConversationId,
    isLoading: isStorageLoading,
    createConversation,
    saveMessages,
    deleteConversation,
    switchConversation,
  } = useChatStorage();
  
  // File state management via custom hook
  const {
    activeFiles,
    currentPath,
    activeFilters,
    handleNavigate,
    handleRefresh,
    handleClearFilters,
    processAIMessage,
    isRefreshing,
  } = useFileSync();

  // Use ref to always get latest currentPath in fetch (avoids stale closure)
  const currentPathRef = useRef(currentPath);
  useEffect(() => {
    currentPathRef.current = currentPath;
  }, [currentPath]);

  // Custom fetch that includes currentPath in the request body
  const customFetch = useCallback(async (url: string, options: RequestInit) => {
    const body = options.body ? JSON.parse(options.body as string) : {};
    body.currentPath = currentPathRef.current;
    
    return window.fetch(url, {
      ...options,
      body: JSON.stringify(body),
    });
  }, []);

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

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-save messages to IndexedDB
  useEffect(() => {
    if (messages.length > 0 && currentConversationId) {
      const storedMessages: StoredMessage[] = messages.map(m => {
        const textPart = m.parts?.find((p: any) => p.type === 'text');
        const content = textPart ? (textPart as any).text : '';
        return {
          id: m.id,
          role: m.role as 'user' | 'assistant' | 'system' | 'tool',
          content,
          toolInvocations: m.parts?.filter((p: any) => p.type === 'tool-invocation'),
        };
      });
      saveMessages(storedMessages);
    }
  }, [messages, currentConversationId, saveMessages]);

  // Create new conversation if none exists
  useEffect(() => {
    if (!isStorageLoading && !currentConversationId) {
      createConversation();
    }
  }, [isStorageLoading, currentConversationId, createConversation]);

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

  // Helper for sending messages from UI buttons (like organize options)
  const sendQuickMessage = useCallback(async (content: string) => {
    if (isLoading) return;
    await sendMessage({
      role: 'user',
      parts: [{ type: 'text', text: content }],
    });
  }, [sendMessage, isLoading]);

  // Voice Control Integration (Realtime API handles voice directly)
  const { lastCommand, resetCommand, isVoiceModeEnabled } = useVoiceControl();

  useEffect(() => {
    if (lastCommand && !isLoading) {
      console.log('🎤 [Voice] Command received:', lastCommand);
      const command = lastCommand.toLowerCase().trim();
      // Extended Thai approval keywords
      const approveKeywords = ['approve', 'accept', 'yes', 'confirm', 'run', 'ok', 'okay', 'ตกลง', 'ใช่', 'ยืนยัน', 'ทำเลย', 'จัดการ', 'เอา', 'ได้', 'ลุย', 'โอเค', 'เลย', 'ดำเนินการ'];
      const denyKeywords = ['deny', 'reject', 'no', 'cancel', 'stop', 'ยกเลิก', 'ไม่', 'หยุด', 'ไม่เอา', 'ไม่ต้อง', 'ไม่ใช่'];

      // Check for pending approval inputs
      // Match EXACTLY how ToolResultRenderer detects approvals
      const lastMsg = messages[messages.length - 1];
      console.log('🎤 [Voice] Last message role:', lastMsg?.role);
      
      let pendingApprovalId: string | undefined;
      
      if (lastMsg?.role === 'assistant' && lastMsg.parts) {
          console.log('🎤 [Voice] Inspecting parts:', JSON.stringify(lastMsg.parts, null, 2));
          // Match ToolResultRenderer logic: type === 'tool-approval-request' OR state === 'approval-requested'
          const approvalPart = lastMsg.parts.find((p: any) => 
            p.type === 'tool-approval-request' || p.state === 'approval-requested'
          );
          if (approvalPart) {
              // Match ToolResultRenderer: approvalId || approval?.id
              pendingApprovalId = (approvalPart as any).approvalId || (approvalPart as any).approval?.id;
              console.log('🎤 [Voice] Found pending approvalId:', pendingApprovalId);
          }
      }

      if (pendingApprovalId) {
        if (approveKeywords.some(k => command.includes(k))) {
           console.log('🎤 [Voice] Approving:', pendingApprovalId);
           addToolApprovalResponse({ id: pendingApprovalId, approved: true });
           resetCommand();
           return;
        }
        if (denyKeywords.some(k => command.includes(k))) {
           console.log('🎤 [Voice] Denying:', pendingApprovalId);
           addToolApprovalResponse({ id: pendingApprovalId, approved: false });
           resetCommand();
           return;
        }
        // IMPORTANT: If there's a pending approval but command doesn't match,
        // DO NOT send as text message - just ignore to prevent breaking tool state
        console.log('🎤 [Voice] Ignoring unrecognized command during pending approval:', command);
        resetCommand();
        return;
      } else {
          console.log('🎤 [Voice] No pending approval found.');
      }

      // Default: Send as text message
      console.log('🎤 [Voice] Sending as text message...');
      sendMessage({
        role: 'user',
        parts: [{ type: 'text', text: lastCommand }],
      });
      resetCommand();
    }
  }, [lastCommand, isLoading, sendMessage, resetCommand, messages, addToolApprovalResponse]);

  return (
    <div className="flex h-full w-full overflow-hidden p-4 gap-4 pb-0 md:pb-4 relative">
      <HistorySidebar
        conversations={conversations}
        currentConversationId={currentConversationId}
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        onSelect={(id) => {
          switchConversation(id);
          setShowHistory(false);
        }}
        onDelete={deleteConversation}
        onNewChat={() => {
          createConversation();
          setShowHistory(false);
          // Focus input after creating new chat
          setTimeout(() => inputRef.current?.focus(), 100);
        }}
      />

      {showExplorer && (
        <div className={cn(
          "h-full shrink-0 border-r border-border/50 transition-all duration-300",
          !currentPath ? "w-[850px]" : "w-[380px]"
        )}>
          <FileExplorer 
            files={activeFiles} 
            currentPath={currentPath}
            className="h-full shadow-lg"
            activeFilters={activeFilters}
            onClearFilters={handleClearFilters}
            onNavigate={handleNavigate}
            onRefresh={handleRefresh}
            onSuggestionClick={sendQuickMessage}
            isLoading={isRefreshing}
          />
        </div>
      )}

      {/* Main Chat Area */}
      <div 
        className={cn(
          "flex-1 flex flex-col h-full bg-card rounded-xl border border-border overflow-hidden shadow-sm relative transition-all min-w-0",
          isDragging && "ring-2 ring-primary ring-inset bg-primary/5"
        )}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!isDragging) setIsDragging(true);
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setIsDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragging(false);

          // 1. Handle files dropped from OS (Finder/Explorer)
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const paths: string[] = [];
            Array.from(e.dataTransfer.files).forEach(file => {
              try {
                const filePath = window.electron?.getPathForFile?.(file);
                if (filePath) paths.push(filePath);
              } catch (err) {
                console.error('Failed to get path for file:', file.name, err);
              }
            });
            
            if (paths.length > 0) {
              const textToInsert = paths.map(p => `"${p}"`).join(' ');
              setInputVal(prev => prev ? `${prev} ${textToInsert}` : textToInsert);
              setTimeout(() => inputRef.current?.focus(), 100);
            }
            return;
          }

          // 2. Handle internal drag (from FileExplorer)
          const droppedPath = e.dataTransfer.getData('text/plain');
          if (droppedPath) {
              const textToInsert = `"${droppedPath}"`;
              setInputVal(prev => prev ? `${prev} ${textToInsert}` : textToInsert);
              setTimeout(() => inputRef.current?.focus(), 100);
          }
        }}
      >
        
        <ChatHeaderControls
          showExplorer={showExplorer}
          setShowExplorer={setShowExplorer}
          activeFilesCount={activeFiles.length}
          setShowHistory={setShowHistory}
          onNewChat={() => {
             createConversation();
             setTimeout(() => inputRef.current?.focus(), 100);
          }}
          onShowAutomation={() => setShowAutomation(true)}
          viewMode={viewMode}
          setViewMode={setViewMode}
        />
        
        {viewMode === 'chat' ? (
          <>
            {/* Automation Panel (Overlaid on chat) */}
            <AutomationPanel 
                isOpen={showAutomation} 
                onClose={() => setShowAutomation(false)} 
            />
            
            {/* Drag Overlay Message */}
            {isDragging && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm pointer-events-none">
                <div className="flex flex-col items-center gap-2 p-6 rounded-xl border border-primary/20 bg-primary/10 text-primary animate-in fade-in zoom-in duration-200">
                  <Sparkles className="w-8 h-8 animate-bounce" />
                  <p className="font-semibold text-lg">Drop files to add context</p>
                </div>
              </div>
            )}
            
            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-4 p-4 scrollbar-thin scrollbar-thumb-primary/10">
                {/* Empty state */}
                {messages.length === 0 && <ChatWelcomeScreen />}
                
                {/* Message list */}
                {messages.map((m) => (
                  <ChatMessage 
                    key={m.id} 
                    message={m} 
                    addToolApprovalResponse={addToolApprovalResponse}
                    onSendMessage={sendQuickMessage}
                  />
                ))}

                {/* Loading indicator */}
                {isLoading && messages[messages.length - 1]?.role === 'user' && (
                  <ChatMessageLoading />
                )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <ChatInputArea
                inputVal={inputVal}
                setInputVal={setInputVal}
                isLoading={isLoading}
                onSubmit={handleSubmit}
                inputRef={inputRef}
            />
          </>
        ) : (
          <VisualProjectMap 
            files={activeFiles}
            currentPath={currentPath}
            onNavigate={handleNavigate}
            onOpenFile={(path) => window.electron.openPath(path)}
          />
        )}
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
