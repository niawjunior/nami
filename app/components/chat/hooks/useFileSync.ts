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
      // Handle tool-listFiles type (the actual type from API)
      if (part.type === 'tool-listFiles') {
        const output = (part as any).output;
        const input = (part as any).input;
        
        // Fetch full file list via IPC (not limited like AI response)
        if (output && input?.path) {
          lastProcessedMsgId.current = message.id;
          setCurrentPath(input.path);
          
          const extensions = input?.extensions && Array.isArray(input.extensions) ? input.extensions : [];
          setActiveFilters(extensions);
          
          window.electron.listFiles({ path: input.path, extensions })
            .then((res: any) => {
              if (res.success && Array.isArray(res.files)) {
                setActiveFiles(res.files);
              } else if (Array.isArray(output.files)) {
                setActiveFiles(output.files);
              }
            })
            .catch(() => {
              if (Array.isArray(output.files)) {
                setActiveFiles(output.files);
              }
            });
          return;
        }

        // Handle legacy array format
        if (Array.isArray(output)) {
          lastProcessedMsgId.current = message.id;
          setActiveFiles(output);
          if (input?.path) {
            setCurrentPath(input.path);
          }
          if (input?.extensions && Array.isArray(input.extensions)) {
            setActiveFilters(input.extensions);
          } else {
            setActiveFilters([]);
          }
          return;
        }
      }

      // Handle tool-invocation type (legacy format)
      if (part.type === 'tool-invocation' || part.type === 'tool-call') {
        const invocation = (part as any).toolInvocation || part;
        if (invocation?.toolName === 'listFiles' && invocation?.result) {
          const result = invocation.result;
          
          if (result.files && Array.isArray(result.files)) {
            lastProcessedMsgId.current = message.id;
            
            if (invocation.args?.path) {
              refreshFiles(invocation.args.path, invocation.args?.extensions);
            } else {
              setActiveFiles(result.files);
            }
            return;
          }

          if (Array.isArray(result)) {
            lastProcessedMsgId.current = message.id;
            setActiveFiles(result);
            if (invocation.args?.path) {
              setCurrentPath(invocation.args.path);
            }
            return;
          }
        }
        
        // Auto-refresh on modification tools
        const modTools = ['moveFile', 'trashFile', 'createDirectory', 'writeToFile', 'copyFile', 'copyFiles'];
        if (modTools.includes(invocation?.toolName)) {
          if (currentPath) {
            refreshFiles(currentPath, activeFilters);
          }
          lastProcessedMsgId.current = message.id;
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
