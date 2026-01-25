'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Trash2, Plus, X, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Conversation } from './hooks/useChatStorage';
import { memo } from 'react';

interface HistorySidebarProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNewChat: () => void;
}

const formatDate = (date: Date) => {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (days === 1) {
    return 'Yesterday';
  } else if (days < 7) {
    return d.toLocaleDateString([], { weekday: 'short' });
  } else {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
};

export const HistorySidebar = memo(function HistorySidebar({
  conversations,
  currentConversationId,
  isOpen,
  onClose,
  onSelect,
  onDelete,
  onNewChat,
}: HistorySidebarProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40"
            onClick={onClose}
          />
          
          {/* Sidebar */}
          <motion.div
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed left-0 top-10 bottom-0 w-72 bg-card border-r border-border z-50 flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                Chat History
              </h2>
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-secondary rounded transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* New Chat Button */}
            <div className="p-3 border-b border-border">
              <button
                onClick={() => {
                  onNewChat();
                  onClose();
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium text-sm"
              >
                <Plus className="w-4 h-4" />
                New Chat
              </button>
            </div>

            {/* Conversation List */}
            <div className="flex-1 overflow-y-auto">
              {conversations.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No conversations yet</p>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {conversations.map((conv) => (
                    <motion.div
                      key={conv.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "group flex items-start gap-2 p-3 rounded-lg cursor-pointer transition-colors",
                        currentConversationId === conv.id
                          ? "bg-primary/10 border border-primary/20"
                          : "hover:bg-secondary border border-transparent"
                      )}
                      onClick={() => {
                        onSelect(conv.id);
                        onClose();
                      }}
                    >
                      <MessageSquare className={cn(
                        "w-4 h-4 shrink-0 mt-0.5",
                        currentConversationId === conv.id ? "text-primary" : "text-muted-foreground"
                      )} />
                      
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "text-sm font-medium truncate",
                          currentConversationId === conv.id ? "text-primary" : "text-foreground"
                        )}>
                          {conv.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(conv.updatedAt)}
                        </p>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(conv.id);
                        }}
                        className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-red-500 rounded transition-all"
                        title="Delete conversation"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-border text-center">
              <p className="text-xs text-muted-foreground">
                {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});
