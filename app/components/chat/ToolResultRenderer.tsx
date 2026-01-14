'use client';

import { ShieldAlert, Check, X } from 'lucide-react';

interface ToolResultRendererProps {
  part: any;
  idx: number;
  onApprove?: (approvalId: string) => void;
  onDeny?: (approvalId: string) => void;
}

export function ToolResultRenderer({ part, idx, onApprove, onDeny }: ToolResultRendererProps) {
  const partAny = part as any;
  
  // Check if this is an approval request
  const isApproval = part.type === 'tool-approval-request' || partAny.state === 'approval-requested';

  if (isApproval) {
    const approvalId = partAny.approvalId || partAny.approval?.id;
    const toolName = partAny.toolCall?.toolName || (part.type.startsWith('tool-') ? part.type.replace(/^tool-/, '') : 'Tool Action');
    const args = partAny.toolCall?.args || partAny.input || {};

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
              onClick={() => onDeny?.(approvalId)}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-background hover:bg-destructive/5 text-muted-foreground hover:text-destructive border border-border hover:border-destructive/20 text-xs font-medium rounded-lg transition-all duration-200"
            >
              <X className="w-3.5 h-3.5" />
              Deny
            </button>
            <button 
              onClick={() => onApprove?.(approvalId)}
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
    const isSpecificTool = part.type !== 'tool-invocation';
    const toolName = isSpecificTool ? part.type.replace('tool-', '') : partAny.toolInvocation?.toolName;
    
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

    // In progress
    return (
      <div key={idx} className="text-xs text-muted-foreground mt-2 flex items-center gap-2 px-2 py-1 bg-primary/5 rounded border border-primary/10 w-fit">
        <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
        <span>Calling {toolName}...</span>
      </div>
    );
  }

  return null;
}
