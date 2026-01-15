'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { FileEntry } from '../../file-browser/FileExplorer';

// Note: window.electron is typed in types/electron.d.ts

export function useFileSync() {
  const [activeFiles, setActiveFiles] = useState<FileEntry[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Track processed tool calls to avoid re-processing (using Set for multiple tools)
  const processedToolCalls = useRef<Set<string>>(new Set());

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

  // Initial load
  useEffect(() => {
    loadDesktop();
  }, []); // Run only once on mount

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
    if (message.role !== 'assistant') {
      return;
    }

    for (const part of message.parts) {
      const partAny = part as any;
      
      // DEBUG: Log ALL parts to see what we're getting
      if (partAny.toolName || part.type?.includes('tool')) {
        console.log('[useFileSync] Found tool part:', part.type, partAny.toolName, partAny.state, Object.keys(partAny));
      }
      
      // Detect listFiles tool - check all possible type formats from AI SDK
      const isListFilesTool = 
        part.type === 'tool-listFiles' || 
        part.type === 'tool-invocation' && partAny.toolName === 'listFiles' ||
        partAny.toolName === 'listFiles' ||
        partAny.toolCall?.toolName === 'listFiles' ||
        partAny.toolInvocation?.toolName === 'listFiles';
      
      // Also need to check if tool is completed (has result/output)
      const isToolComplete = partAny.state === 'result' || partAny.state === 'output' || partAny.output !== undefined;
      
      if (isListFilesTool && isToolComplete) {
        // Get output from various possible locations
        const output = partAny.output ?? partAny.result ?? partAny.toolInvocation?.result ?? partAny.toolCall?.result;
        // Input may be in different locations depending on SDK version
        const input = partAny.input ?? partAny.rawInput ?? partAny.args ?? partAny.toolInvocation?.args ?? partAny.toolCall?.args;
        
        // DEBUG: Log everything
        console.log('[useFileSync] listFiles part:', JSON.stringify({
          type: part.type,
          keys: Object.keys(partAny),
          input,
          outputPath: output?.path,
          outputFiles: output?.files?.length,
        }, null, 2));
        
        // Only process if we have output (tool completed)
        if (!output) {
          console.log('[useFileSync] No output, skipping');
          continue;
        }
        
        // Get path from output first (guaranteed absolute by tool) or fallback to input
        let pathToUse = output?.path ?? input?.path;
        
        // Fallback: If path is missing or relative, try to infer prompt absolute path from the files list
        if ((!pathToUse || !pathToUse.startsWith('/')) && 
            output?.files && Array.isArray(output.files) && output.files.length > 0 && output.files[0].path) {
          // Extract directory from the first file's absolute path
          // We assume all listed files are in the same directory (which is true for listFiles)
          const firstFilePath = output.files[0].path;
          // specific check for windows vs mac separators could be added here if needed, 
          // but normalized paths usually work.
          // We can use a simple string manipulation for the frontend
          const separator = firstFilePath.includes('\\') ? '\\' : '/';
          const lastIndex = firstFilePath.lastIndexOf(separator);
          if (lastIndex > 0) {
            pathToUse = firstFilePath.substring(0, lastIndex);
            console.log('[useFileSync] Inferred absolute path from file list:', pathToUse);
          }
        }

        console.log('[useFileSync] pathToUse:', pathToUse);
        
        // Skip if we already processed this specific tool call
        const toolCallId = partAny.toolCallId || partAny.id;
        if (toolCallId && processedToolCalls.current.has(toolCallId)) {
          console.log('[useFileSync] Already processed toolCallId:', toolCallId);
          continue;
        }
        
        // Fetch full file list via IPC (not limited like AI response)
        if (pathToUse) {
          console.log('[useFileSync] Updating to path:', pathToUse);
          if (toolCallId) processedToolCalls.current.add(toolCallId);
          setCurrentPath(pathToUse);
          
          const extensions = input?.extensions && Array.isArray(input.extensions) ? input.extensions : [];
          setActiveFilters(extensions);
          
          window.electron.listFiles({ path: pathToUse, extensions })
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
          if (toolCallId) processedToolCalls.current.add(toolCallId);
          setActiveFiles(output.files);
          return;
        }
        if (Array.isArray(output)) {
          if (toolCallId) processedToolCalls.current.add(toolCallId);
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
        const modToolId = partAny.toolCallId || partAny.id || `${toolName}-${Date.now()}`;
        if (currentPath && !processedToolCalls.current.has(modToolId)) {
          processedToolCalls.current.add(modToolId);
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
