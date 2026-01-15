'use client';

import { useState, useRef, useCallback } from 'react';
import { FileEntry } from '../../file-browser/FileExplorer';

// Note: window.electron is typed in types/electron.d.ts

export function useFileSync() {
  const [activeFiles, setActiveFiles] = useState<FileEntry[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Track last processed message to avoid re-processing
  const lastProcessedMsgId = useRef<string | null>(null);

  // Refresh files from filesystem using IPC
  const refreshFiles = useCallback(async (path: string, extensions?: string[]) => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    
    try {
      const res = await window.electron.listFiles({ path, extensions });
      if (res.success && Array.isArray(res.files)) {
        setActiveFiles(res.files);
        setCurrentPath(path);
        if (extensions) {
          setActiveFilters(extensions);
        }
      }
    } catch (err) {
      console.error('Failed to refresh files:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing]);

  // Load Desktop as default
  const loadDesktop = useCallback(async () => {
    try {
      const desktopPath = await window.electron.getDesktopPath();
      await refreshFiles(desktopPath);
    } catch (err) {
      console.error('Failed to load desktop:', err);
    }
  }, [refreshFiles]);

  // Navigate to a folder
  const handleNavigate = useCallback((path: string) => {
    refreshFiles(path, activeFilters);
  }, [refreshFiles, activeFilters]);

  // Refresh current path
  const handleRefresh = useCallback(() => {
    if (currentPath) {
      refreshFiles(currentPath, activeFilters);
    }
  }, [currentPath, activeFilters, refreshFiles]);

  // Clear filters and refresh
  const handleClearFilters = useCallback(() => {
    setActiveFilters([]);
    if (currentPath) {
      refreshFiles(currentPath, []);
    }
  }, [currentPath, refreshFiles]);

  // Process AI messages for file updates
  const processAIMessage = useCallback((message: any) => {
    if (message.id === lastProcessedMsgId.current || message.role !== 'assistant') {
      return;
    }

    for (const part of message.parts) {
      const partAny = part as any;
      
      // Detect listFiles tool - check all possible type formats
      const isListFilesTool = 
        part.type === 'tool-listFiles' || 
        partAny.toolName === 'listFiles' ||
        partAny.toolCall?.toolName === 'listFiles' ||
        partAny.toolInvocation?.toolName === 'listFiles';
      
      if (isListFilesTool) {
        // Get output from various possible locations
        const output = partAny.output ?? partAny.result ?? partAny.toolInvocation?.result ?? partAny.toolCall?.result;
        const input = partAny.input ?? partAny.args ?? partAny.toolInvocation?.args ?? partAny.toolCall?.args;
        
        // Only process if we have output (tool completed)
        if (!output) continue;
        
        // Fetch full file list via IPC (not limited like AI response)
        if (input?.path) {
          lastProcessedMsgId.current = message.id;
          setCurrentPath(input.path);
          
          const extensions = input?.extensions && Array.isArray(input.extensions) ? input.extensions : [];
          setActiveFilters(extensions);
          
          window.electron.listFiles({ path: input.path, extensions })
            .then((res: any) => {
              if (res.success && Array.isArray(res.files)) {
                setActiveFiles(res.files);
              } else if (output.files && Array.isArray(output.files)) {
                setActiveFiles(output.files);
              } else if (Array.isArray(output)) {
                setActiveFiles(output);
              }
            })
            .catch(() => {
              if (output.files && Array.isArray(output.files)) {
                setActiveFiles(output.files);
              } else if (Array.isArray(output)) {
                setActiveFiles(output);
              }
            });
          return;
        }

        // Handle legacy array format without path in input
        if (output.files && Array.isArray(output.files)) {
          lastProcessedMsgId.current = message.id;
          setActiveFiles(output.files);
          return;
        }
        if (Array.isArray(output)) {
          lastProcessedMsgId.current = message.id;
          setActiveFiles(output);
          return;
        }
      }

      // Auto-refresh on modification tools
      const toolName = partAny.toolName ?? 
                       partAny.toolCall?.toolName ?? 
                       partAny.toolInvocation?.toolName ??
                       (part.type.startsWith('tool-') ? part.type.replace('tool-', '') : null);
      
      const modTools = ['moveFile', 'trashFile', 'createDirectory', 'writeToFile', 'copyFile', 'copyFiles', 'moveFiles', 'trashFiles'];
      const hasResult = partAny.output ?? partAny.result ?? partAny.toolInvocation?.result;
      
      if (toolName && modTools.includes(toolName) && hasResult) {
        if (currentPath && message.id !== lastProcessedMsgId.current) {
          lastProcessedMsgId.current = message.id;
          refreshFiles(currentPath, activeFilters);
        }
      }
    }
  }, [currentPath, activeFilters, refreshFiles]);

  return {
    activeFiles,
    currentPath,
    activeFilters,
    isRefreshing,
    refreshFiles,
    loadDesktop,
    handleNavigate,
    handleRefresh,
    handleClearFilters,
    processAIMessage,
    setActiveFiles,
    setCurrentPath,
    setActiveFilters,
  };
}
