'use client';

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

export function ChatWelcomeScreen() {
  return (
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
  );
}
