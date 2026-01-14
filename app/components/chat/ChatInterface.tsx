'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';
import { useEffect, useState, useRef, useMemo } from 'react';
import { Send,  Bot, User, Sparkles, LayoutPanelLeft, ShieldAlert, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { UIMessagePart } from 'ai';
import { FileExplorer, FileEntry } from '../file-browser/FileExplorer';

// The inner component that handles the active chat session
function ChatSession({ apiPort }: { apiPort: number }) {
  const [inputVal, setInputVal] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // State for file explorer
  const [activeFiles, setActiveFiles] = useState<FileEntry[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [showExplorer, setShowExplorer] = useState(true); // Always visible
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false); // Debounce refreshing

  // @ts-ignore
  const { messages, sendMessage, status, error, addToolApprovalResponse } = useChat({
    transport: new DefaultChatTransport({
        api: `http://localhost:${apiPort}/api/chat`,
        fetch: window.fetch.bind(window)
    }),
    // Auto-continue conversation after tool approval responses
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onError: (err) => {
        console.error("Chat error:", err);
    }
  });

  // Track last processed message to avoid re-processing
  const lastProcessedMsgId = useRef<string | null>(null);

  // Extract files from tool results (only when AI returns listFiles)
  useEffect(() => {
      if (messages.length === 0) return;
      
      const lastMsg = messages[messages.length - 1];
      // Skip if already processed or not from assistant
      if (lastMsg.id === lastProcessedMsgId.current || lastMsg.role !== 'assistant') return;
      
      for (const part of lastMsg.parts) {
          // Handle tool-listFiles type (the actual type from API)
          if (part.type === 'tool-listFiles') {
              const output = (part as any).output;
              const input = (part as any).input;
              
              // Handle new object format (from limited results)
              // Instead of using limited AI response, fetch FULL list via IPC
              if (output && input?.path) {
                  lastProcessedMsgId.current = lastMsg.id;
                  setCurrentPath(input.path);
                  
                  // Extract filter extensions
                  const extensions = input?.extensions && Array.isArray(input.extensions) ? input.extensions : [];
                  setActiveFilters(extensions);
                  
                  // Fetch full file list via IPC (not limited like AI response)
                  window.electron.listFiles({ path: input.path, extensions })
                      .then((res: any) => {
                          if (res.success && Array.isArray(res.files)) {
                              setActiveFiles(res.files);
                          } else if (Array.isArray(output.files)) {
                              // Fallback to AI response if IPC fails
                              setActiveFiles(output.files);
                          }
                      })
                      .catch(() => {
                          // Fallback to AI response on error
                          if (Array.isArray(output.files)) {
                              setActiveFiles(output.files);
                          }
                      });
                  return;
              }

              // Handle legacy array format
              if (Array.isArray(output)) {
                  lastProcessedMsgId.current = lastMsg.id;
                  setActiveFiles(output);
                  if (input?.path) {
                      setCurrentPath(input.path);
                  }
                  // Extract filter extensions
                  if (input?.extensions && Array.isArray(input.extensions)) {
                      setActiveFilters(input.extensions);
                  } else {
                      setActiveFilters([]);
                  }
                  return;
              }
          }
          
          // Fallback for tool-invocation type (in case SDK changes behavior)
          if (part.type === 'tool-invocation') {
              const invocation = (part as any).toolInvocation;
              if (invocation?.toolName === 'listFiles') {
                  const result = invocation.result;

                  // Handle new object format
                  if (result && Array.isArray(result.files)) {
                      lastProcessedMsgId.current = lastMsg.id;
                      setActiveFiles(result.files);
                      if (invocation.args?.path) {
                          setCurrentPath(invocation.args.path);
                      }
                      return;
                  }

                  // Handle legacy array format
                  if (Array.isArray(result)) {
                      lastProcessedMsgId.current = lastMsg.id;
                      setActiveFiles(result);
                      if (invocation.args?.path) {
                          setCurrentPath(invocation.args.path);
                      }
                      return;
                  }
              }
              
              // NEW: Auto-refresh on modification tools (move, trash, create)
              const modTools = ['moveFile', 'trashFile', 'createDirectory', 'writeToFile'];
              if (modTools.includes(invocation?.toolName)) {
                   // Refresh current path
                   if (currentPath) {
                       window.electron.listFiles({ path: currentPath, extensions: activeFilters })
                           .then((res: any) => {
                               if (res.success && Array.isArray(res.files)) {
                                   setActiveFiles(res.files);
                               }
                           });
                   }
                   lastProcessedMsgId.current = lastMsg.id;
              }
          }
      }
  }, [messages]);
  
  const isLoading = status === 'streaming' || status === 'submitted';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-focus input on keydown
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is already typing in an input or textarea
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      // Ignore modifier keys
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      
      inputRef.current?.focus();
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Keep focus on input after sending
  useEffect(() => {
    if (!isLoading) {
        // Simple timeout to ensure UI has settled
        setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!inputVal.trim() || isLoading) return;
      
      const content = inputVal;
      setInputVal('');
      
      await sendMessage({
          role: 'user',
          parts: [{ type: 'text', text: content }]
      });
  };

  // Refresh files from filesystem using IPC
  const refreshFiles = async (path: string, extensions?: string[]) => {
      if (!window.electron?.listFiles) return;
      try {
          const result = await window.electron.listFiles({ path, extensions });
          if (result.success && result.files) {
              setActiveFiles(result.files);
              setCurrentPath(path);
              setActiveFilters(extensions || []);
          }
      } catch (err) {
          console.error('Failed to list files:', err);
      }
  };

  // Watch directory for changes
  useEffect(() => {
     if (currentPath) {
         window.electron.watchDirectory(currentPath);
     }
  }, [currentPath]);

  // Listen for file system changes and auto-refresh
  useEffect(() => {
     window.electron.onDirectoryChanged((path) => {
         // Only refresh if the event matches current path
         if (currentPath && !isRefreshing) {
             setIsRefreshing(true);
             refreshFiles(currentPath, activeFilters).finally(() => {
                 setTimeout(() => setIsRefreshing(false), 500); // 500ms debounce
             });
         }
     });
  }, [currentPath, activeFilters, isRefreshing]);

  // Load Desktop on mount
  useEffect(() => {
      const loadDesktop = async () => {
          if (!window.electron?.getDesktopPath) return;
          try {
              const desktopPath = await window.electron.getDesktopPath();
              refreshFiles(desktopPath);
          } catch (err) {
              console.error('Failed to get desktop path:', err);
          }
      };
      loadDesktop();
  }, []);

  // Navigate to a folder
  const handleNavigate = (path: string) => {
      refreshFiles(path, activeFilters);
  };

  // Refresh current path
  const handleRefresh = () => {
      if (currentPath) {
          refreshFiles(currentPath, activeFilters);
      }
  };

  // Clear filters and refresh
  const handleClearFilters = () => {
      setActiveFilters([]);
      if (currentPath) {
          refreshFiles(currentPath, []);
      }
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
            
            {messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  "flex w-full mb-4",
                  m.role === 'user' ? "justify-end" : "justify-start"
                )}
              >
                <div className={cn(
                  "flex max-w-[85%] rounded-2xl p-4 shadow-sm border",
                  m.role === 'user' 
                    ? "bg-primary text-primary-foreground border-transparent rounded-tr-sm" 
                    : "bg-card text-card-foreground border-border rounded-tl-sm ml-2"
                )}>
                  {m.role !== 'user' && (
                      <div className="mr-3 mt-1 min-w-[24px]">
                          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                              <Bot size={14} className="text-primary" />
                          </div>
                      </div>
                  )}
                  <div className="whitespace-pre-wrap text-sm leading-relaxed min-w-0">
                    {/* Render Parts */}
                    {m.parts.map((part, idx) => {
                        if (part.type === 'text') {
                            return <span key={idx} className="block">{part.text}</span>;
                        } 
                        const partAny = part as any;
                        const isApproval = part.type === 'tool-approval-request' || partAny.state === 'approval-requested';

                        if (isApproval) {
                            const approvalId = partAny.approvalId || partAny.approval?.id;
                            const toolName = partAny.toolCall?.toolName || (part.type.startsWith('tool-') ? part.type.replace(/^tool-/, '') : 'Tool Action');
                            const args = partAny.toolCall?.args || partAny.input || {};

                            const handleApproval = (approved: boolean) => {
                                // @ts-ignore
                                if (typeof addToolApprovalResponse === 'function') {
                                    // @ts-ignore
                                    addToolApprovalResponse({ id: approvalId, approved });
                                }
                            };

                             return (
                                 <div key={idx} className="mt-4 mb-2 overflow-hidden rounded-xl border border-amber-200/50 bg-amber-50/50 dark:bg-amber-950/10 dark:border-amber-900/50 max-w-[450px] shadow-sm">
                                     <div className="flex items-center gap-3 px-4 py-3 border-b border-amber-100 dark:border-amber-900/30 bg-amber-100/20 dark:bg-amber-950/20">
                                         <div className="p-1.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-500 ring-1 ring-amber-200/50 dark:ring-amber-800/50">
                                             <ShieldAlert className="w-4 h-4" />
                                         </div>
                                         <div className="flex flex-col">
                                            <span className="font-semibold text-sm text-amber-900 dark:text-amber-100">Permission Request</span>
                                            <span className="text-[10px] text-amber-700/70 dark:text-amber-400/70 font-medium uppercase tracking-wide">
                                                Nami needs your confirmation
                                            </span>
                                         </div>
                                     </div>
                                     
                                     <div className="p-4 space-y-3">
                                         <div className="space-y-1.5">
                                            <div className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 rounded-full bg-primary/70"></span>
                                                Action: <span className="font-mono text-primary font-semibold">{toolName}</span>
                                            </div>
                                         </div>

                                         <div className="bg-background/80 dark:bg-zinc-950/50 rounded-lg border border-border/50 p-3 shadow-sm">
                                             <pre className="text-xs font-mono text-foreground/80 whitespace-pre-wrap overflow-x-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                                                {JSON.stringify(args, null, 2)}
                                             </pre>
                                         </div>

                                         <div className="grid grid-cols-2 gap-3 pt-1">
                                             <button
                                                 onClick={() => handleApproval(false)}
                                                 className="flex items-center justify-center gap-2 px-4 py-2 bg-background hover:bg-destructive/5 text-muted-foreground hover:text-destructive border border-border hover:border-destructive/20 text-xs font-medium rounded-lg transition-all duration-200"
                                             >
                                                 <X className="w-3.5 h-3.5" />
                                                 Deny
                                             </button>
                                             <button 
                                                 onClick={() => handleApproval(true)}
                                                 className="flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-md hover:shadow-lg hover:shadow-green-900/20 border border-green-500/20 text-xs font-semibold rounded-lg transition-all duration-200"
                                             >
                                                 <Check className="w-3.5 h-3.5" />
                                                 Approve Action
                                             </button>
                                         </div>
                                     </div>
                                 </div>
                             );
                        }

                        // Handle tool calls (any type starting with tool-)
                        if (part.type.startsWith('tool-')) {
                            // Determine tool name and state
                            const partAny = part as any;
                            const isSpecificTool = part.type !== 'tool-invocation';
                            const toolName = isSpecificTool ? part.type.replace('tool-', '') : partAny.toolInvocation?.toolName;
                            
                            // Normalized objects
                            // Check multiple properties where result might be stored in different SDK versions
                            const rawOutput = 'output' in part ? partAny.output : (partAny.toolInvocation?.result !== undefined ? partAny.toolInvocation?.result : partAny.result);
                            const output = rawOutput;
                            
                            const error = 'error' in part ? partAny.error : partAny.toolInvocation?.error;
                            const isComplete = partAny.state === 'result' || partAny.state === 'output-available' || rawOutput !== undefined;
                            
                            // Check for error
                            if (error) {
                                return (
                                    <div key={idx} className="text-xs text-destructive mt-2 flex flex-col gap-1 px-2 py-1 bg-destructive/10 rounded border border-destructive/20 w-fit">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-destructive" />
                                            <span className="font-medium">Error: {toolName}</span>
                                        </div>
                                        <div className="opacity-70 pl-4">
                                            {typeof error === 'string' ? error : (error.message || 'Unknown error')}
                                        </div>
                                    </div>
                                );
                            }

                            // Check for success (has output or completed state)
                            if (isComplete) {
                                return (
                                <div key={idx} className="text-xs text-muted-foreground mt-2 flex flex-col gap-1 px-2 py-1 bg-green-500/10 rounded border border-green-500/20 w-fit">
                                   <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-green-500" />
                                        <span className="font-medium text-green-600 dark:text-green-400">Done: {toolName}</span>
                                   </div>
                                    {toolName === 'listFiles' && Array.isArray(output) && (
                                        <div className="text-[10px] opacity-70 pl-4">
                                            Found {output.length} files
                                        </div>
                                    )}
                                </div>
                                );
                            }
                            
                            // Pending state
                             return (
                               <div key={idx} className="text-xs text-muted-foreground mt-2 italic flex items-center gap-2 px-2 py-1 bg-secondary/50 rounded border border-border/50 w-full">
                                   <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                                   <span className="truncate">Calling {toolName}...</span>
                               </div>
                             );
                        }
                        return null;
                    })}
                  </div>
                </div>
              </motion.div>
            ))}
            {isLoading && messages[messages.length - 1]?.role === 'user' && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="flex w-full mb-4 justify-start"
              >
                <div className="flex max-w-[85%] rounded-2xl p-4 shadow-sm border bg-card text-card-foreground border-border rounded-tl-sm ml-2">
                   <div className="mr-3 mt-1 min-w-[24px]">
                      <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
                          <Bot size={14} className="text-primary" />
                      </div>
                   </div>
                   <div className="flex items-center gap-1 h-6">
                      <div className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <div className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <div className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce" />
                   </div>
                </div>
              </motion.div>
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
              // Kept enabled even during loading so user maintains focus awareness
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

// The main loader component
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
