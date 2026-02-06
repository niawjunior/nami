'use client';

import { Mic, MicOff, Loader2, Radio, Wifi } from 'lucide-react';
import { useVoiceControl } from './VoiceControlProvider';
import { cn } from '@/lib/utils';

export function VoiceToggle() {
  const { 
    isVoiceModeEnabled, 
    toggleVoiceMode, 
    isConnected,
    isListening, 
    isSpeaking,
  } = useVoiceControl();

  return (
    <button
      onClick={toggleVoiceMode}
      className={cn(
        "p-2 rounded-full transition-all duration-300 relative group no-drag",
        isVoiceModeEnabled 
          ? "bg-red-500/10 text-red-500 hover:bg-red-500/20" 
          : "hover:bg-accent text-muted-foreground hover:text-foreground"
      )}
      title={isVoiceModeEnabled ? "Disable Voice Mode (Realtime)" : "Enable Voice Mode (Realtime)"}
      type="button"
    >
      {/* Status Ring Animation */}
      {isVoiceModeEnabled && (
        <div className="absolute inset-0 rounded-full animate-pulse bg-red-500/10 pointer-events-none" />
      )}
      
      {/* Connection indicator */}
      {isVoiceModeEnabled && isConnected && (
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
        </span>
      )}

      {isVoiceModeEnabled && !isConnected ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : isSpeaking ? (
         <div className="relative">
             <Radio className="w-5 h-5 animate-pulse text-red-600" />
         </div>
      ) : isListening ? (
         <Wifi className="w-5 h-5 text-green-500" />
      ) : isVoiceModeEnabled ? (
         <Mic className="w-5 h-5" />
      ) : (
         <MicOff className="w-5 h-5" />
      )}
    </button>
  );
}
