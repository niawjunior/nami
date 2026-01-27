'use client';

import { LayoutPanelLeft, History, Plus, Play } from 'lucide-react';
import { RefObject } from 'react';

interface ChatHeaderControlsProps {
  showExplorer: boolean;
  setShowExplorer: (show: boolean) => void;
  activeFilesCount: number;
  setShowHistory: (show: boolean) => void;
  onNewChat: () => void;
  onShowAutomation: () => void;
  viewMode: 'chat' | 'visual';
  setViewMode: (mode: 'chat' | 'visual') => void;
}

export function ChatHeaderControls({
  showExplorer,
  setShowExplorer,
  activeFilesCount,
  setShowHistory,
  onNewChat,
  onShowAutomation,
  viewMode,
  setViewMode
}: ChatHeaderControlsProps) {
  return (
    <div className="absolute top-4 left-4 z-10 flex items-center gap-2 no-drag">
      {!showExplorer && activeFilesCount > 0 && (
        <button 
          onClick={() => setShowExplorer(true)}
          className="p-2 bg-secondary rounded-lg border border-border hover:bg-secondary/80 transition-colors"
          title="Show Files"
        >
          <LayoutPanelLeft size={16} />
        </button>
      )}

      {/* View Mode Toggle */}
      <div className="flex items-center gap-1 p-1 bg-secondary rounded-lg border border-border">
         <button
            onClick={() => setViewMode('chat')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${viewMode === 'chat' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
         >
            Chat
         </button>
         <button
            onClick={() => setViewMode('visual')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${viewMode === 'visual' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
         >
            Visual
         </button>
      </div>

      <button 
        onClick={() => setShowHistory(true)}
        className="p-2 bg-secondary rounded-lg border border-border hover:bg-secondary/80 transition-colors"
        title="Chat History"
      >
        <History size={16} />
      </button>

      <button 
        onClick={onNewChat}
        className="p-2 bg-secondary rounded-lg border border-border hover:bg-secondary/80 transition-colors"
        title="New Chat"
      >
        <Plus size={16} />
      </button>

      <button 
        onClick={onShowAutomation}
        className="p-2 bg-secondary rounded-lg border border-border hover:bg-secondary/80 transition-colors"
        title="Automation Rules"
      >
        <Play size={16} className="text-primary" />
      </button>
    </div>
  );
}

