'use client';

import { motion } from 'framer-motion';
import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ToolResultRenderer } from './ToolResultRenderer';
import { OrganizeOptionsCard } from './OrganizeOptionsCard';

interface ChatMessageProps {
  message: any;
  addToolApprovalResponse: (args: { id: string; approved: boolean }) => void;
  onSendMessage?: (message: string) => void;
}

export function ChatMessage({ message, addToolApprovalResponse, onSendMessage }: ChatMessageProps) {
  const isUser = message.role === 'user';

  const handleApprove = (approvalId: string) => {
    addToolApprovalResponse({ id: approvalId, approved: true });
  };

  const handleDeny = (approvalId: string) => {
    addToolApprovalResponse({ id: approvalId, approved: false });
  };

  const handleOrganizeOption = (optionId: string) => {
    if (!onSendMessage) return;
    
    const optionMessages: Record<string, string> = {
      'full-auto': 'Yes, do full auto-organize',
      'review-plan': 'Show me the plan first',
      'clean-junk': 'Just clean up junk files',
    };
    onSendMessage(optionMessages[optionId] || optionId);
  };

  // Check for analyzeFolder result to show OrganizeOptionsCard
  const analyzeFolderPart = message.parts.find((part: any) => {
    const toolName = part.toolName || (part.type === 'tool-invocation' && part.toolName);
    return toolName === 'analyzeFolder' && part.output;
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "flex w-full mb-4",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div className={cn(
        "flex max-w-[85%] rounded-2xl p-4 shadow-sm border",
        isUser 
          ? "bg-primary text-primary-foreground border-transparent rounded-tr-sm" 
          : "bg-card text-card-foreground border-border rounded-tl-sm ml-2"
      )}>
        {/* Bot avatar */}
        {!isUser && (
          <div className="mr-3 mt-1 min-w-[24px]">
            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
              <Bot size={14} className="text-primary" />
            </div>
          </div>
        )}

        {/* Message content */}
        <div className="whitespace-pre-wrap text-sm leading-relaxed min-w-0">
          {message.parts.map((part: any, idx: number) => {
            // Text content
            if (part.type === 'text') {
              return <span key={idx} className="block">{part.text}</span>;
            }

            // Special handling for analyzeFolder - show OrganizeOptionsCard
            const partAny = part as any;
            const toolName = partAny.title || partAny.toolName || 
              (part.type?.startsWith('tool-') ? part.type.replace(/^tool-/, '') : null);
            const output = partAny.output ?? partAny.result;
            const isComplete = partAny.state === 'result' || partAny.state === 'output-available' || output !== undefined;
            
            if (toolName === 'analyzeFolder' && output && isComplete && onSendMessage) {
              return (
                <OrganizeOptionsCard
                  key={idx}
                  folderPath={partAny.input?.path || ''}
                  analysis={output}
                  onSelectOption={handleOrganizeOption}
                />
              );
            }

            // Tool results (approval, success, error, loading)
            if (part.type.startsWith('tool-') || part.type === 'tool-approval-request') {
              return (
                <ToolResultRenderer
                  key={idx}
                  part={part}
                  idx={idx}
                  onApprove={handleApprove}
                  onDeny={handleDeny}
                />
              );
            }

            return null;
          })}
        </div>
      </div>
    </motion.div>
  );
}

// Loading indicator for when bot is typing
export function ChatMessageLoading() {
  return (
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
  );
}
