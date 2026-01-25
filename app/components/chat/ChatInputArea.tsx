'use client';

import { Send } from 'lucide-react';
import { RefObject } from 'react';

interface ChatInputAreaProps {
  inputVal: string;
  setInputVal: (val: string) => void;
  isLoading: boolean;
  onSubmit: (e: React.FormEvent) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}

export function ChatInputArea({
  inputVal,
  setInputVal,
  isLoading,
  onSubmit,
  inputRef
}: ChatInputAreaProps) {
  return (
    <div className="relative p-4 pt-2">
      <form 
        onSubmit={onSubmit} 
        className="relative group"
      >
        <input
          ref={inputRef}
          className="w-full bg-secondary border border-border rounded-xl px-4 py-4 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium placeholder:text-muted-foreground"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder="Describe a file task... (or drop files here)"
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
  );
}
