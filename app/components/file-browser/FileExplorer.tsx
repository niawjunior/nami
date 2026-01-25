'use client';

import { Folder, X, Eye, ExternalLink, AlertCircle, FileText, Home, Monitor, Download, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useState, useEffect, useRef, useCallback } from 'react';
import { FileExplorerSkeleton } from './FileExplorerSkeleton';
import { BatchRenameModal } from './BatchRenameModal';
import { FileEntryRow } from './FileEntryRow';
import { FileExplorerHeader } from './FileExplorerHeader';
import { FileContextMenu } from './FileContextMenu';

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  lastModified: number;
  childCount?: number;
}

interface FileExplorerProps {
  files: FileEntry[];
  currentPath?: string;
  className?: string;
  activeFilters?: string[];
  onClearFilters?: () => void;
  onNavigate?: (path: string) => void;
  onRefresh?: () => void;
  onSuggestionClick?: (message: string) => void;
  isLoading?: boolean;
}

const isImageFile = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext || '');
};

const isTextFile = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    return ['txt', 'md', 'json', 'yml', 'yaml', 'js', 'ts', 'tsx', 'jsx', 'css', 'html', 'log', 'sh', 'py', 'c', 'cpp', 'h', 'ini', 'conf', 'csv'].includes(ext || '');
};

export function FileExplorer({ 
  files, 
  currentPath, 
  className, 
  activeFilters,
  onClearFilters,
  onNavigate,
  onRefresh,
  onSuggestionClick,
  isLoading = false
}: FileExplorerProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, file: FileEntry } | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [showBatchRename, setShowBatchRename] = useState(false);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number>(-1);
  const [previewFile, setPreviewFile] = useState<FileEntry | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [quickPaths, setQuickPaths] = useState<{ name: string; path: string; icon: any }[]>([]);
  const [recentPaths, setRecentPaths] = useState<string[]>([]);
  const [suggestion, setSuggestion] = useState<{ message: string; subtext: string; prompt: string } | null>(null);
  const [folderSizes, setFolderSizes] = useState<Record<string, number>>({});

  const handleCalculateSize = async (file: FileEntry) => {
      if (!file.isDirectory) return;
      try {
          const size = await window.electron.getFolderSize(file.path);
          setFolderSizes(prev => ({ ...prev, [file.path]: size }));
      } catch (err) {
          console.error("Failed to calculate size:", err);
      }
  };

  // Load recent paths from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('nami-recent-paths');
      if (stored) {
        setRecentPaths(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load recent paths:', e);
    }
  }, []);

  // Track visited folders and update recent paths
  useEffect(() => {
    if (!currentPath) return;
    setRecentPaths(prev => {
      const filtered = prev.filter(p => p !== currentPath);
      const updated = [currentPath, ...filtered].slice(0, 5);
      try {
        localStorage.setItem('nami-recent-paths', JSON.stringify(updated));
      } catch (e) { console.error(e); }
      return updated;
    });
  }, [currentPath]);

  // Calculate quick paths on mount
  useEffect(() => {
    window.electron?.getDesktopPath().then(desktopPath => {
        if (!desktopPath) return;
        const separator = desktopPath.includes('\\') ? '\\' : '/';
        const homePath = desktopPath.substring(0, desktopPath.lastIndexOf(separator));
        const { Home, Monitor, Download, FileText } = require('lucide-react');
        
        setQuickPaths([
            { name: 'Home', path: homePath, icon: Home },
            { name: 'Desktop', path: desktopPath, icon: Monitor },
            { name: 'Downloads', path: `${homePath}${separator}Downloads`, icon: Download },
            { name: 'Documents', path: `${homePath}${separator}Documents`, icon: FileText },
        ]);
    });
  }, []);

  // Close context menu on click elsewhere
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  // Load image preview
  useEffect(() => {
    if (previewFile && isImageFile(previewFile.name)) {
        setLoadingImage(true);
        setImageDataUrl(null);
        window.electron?.readImageAsBase64(previewFile.path)
            .then((dataUrl) => {
                setImageDataUrl(dataUrl);
                setLoadingImage(false);
            })
            .catch(() => setLoadingImage(false));
    } else {
        setImageDataUrl(null);
    }
  }, [previewFile]);

  // Load text preview
  useEffect(() => {
    if (previewFile && isTextFile(previewFile.name)) {
        setLoadingText(true);
        setTextContent(null);
        window.electron?.readTextFile(previewFile.path)
            .then((text) => {
                setTextContent(text);
                setLoadingText(false);
            })
            .catch(() => {
                setTextContent("Failed to load content.");
                setLoadingText(false);
            });
    } else {
        setTextContent(null);
    }
  }, [previewFile]);

  // Smart Suggestions Logic
  useEffect(() => {
    if (!files || files.length === 0) {
        setSuggestion(null);
        return;
    }
    const fileCount = files.filter(f => !f.isDirectory).length;
    if (fileCount > 10) {
        setSuggestion({
            message: "Folder looks cluttered",
            subtext: `Organize ${fileCount} files?`,
            prompt: `I see ${fileCount} files in this folder. Can you help me organize them?`
        });
    } else if (fileCount > 5) {
         setSuggestion({
            message: "New files found",
            subtext: "Analyze contents?",
            prompt: "Analyze this folder and tell me what's inside."
        });
    } else {
        setSuggestion(null);
    }
  }, [files, currentPath]);

  // Keyboard shortcuts
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          const tag = document.activeElement?.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA') return;
          
          if (e.key === 'Escape') {
              setPreviewFile(null);
              setContextMenu(null);
              setSelectedFiles(new Set());
              setSelectedFile(null);
          }
          if (e.key === ' ' && selectedFile && (isImageFile(selectedFile.name) || isTextFile(selectedFile.name))) {
              e.preventDefault();
              setPreviewFile(prev => prev ? null : selectedFile);
          }
          if (e.key === 'Enter' && selectedFile) {
              e.preventDefault();
              if (selectedFile.isDirectory && onNavigate) onNavigate(selectedFile.path);
              else window.electron?.openPath(selectedFile.path);
          }
          if ((e.metaKey || e.ctrlKey) && e.key === 'Backspace' && selectedFiles.size > 0 && onSuggestionClick) {
              e.preventDefault();
              const paths = Array.from(selectedFiles);
              const cmd = paths.length === 1 ? `Move "${paths[0]}" to trash` : `Move these ${paths.length} files to trash: ${paths.map(p => `"${p}"`).join(', ')}`;
              onSuggestionClick(cmd);
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFile, selectedFiles, onNavigate, onSuggestionClick]);

  const handleOpen = async (file: FileEntry) => {
      try {
          await window.electron?.openPath(file.path);
      } catch (err) { console.error("Failed to open file:", err); }
      setContextMenu(null);
  };

  const handleReveal = async (path: string) => {
      try {
          await window.electron?.showItemInFolder(path);
      } catch (err) { console.error("Failed to reveal:", err); }
      setContextMenu(null);
  };
  
  const handleCopyPath = (path: string) => {
      navigator.clipboard.writeText(path);
      setContextMenu(null);
  };

  const handleClick = (file: FileEntry, index: number, isShift: boolean, isCmd: boolean) => {
      if (isShift && lastSelectedIndex >= 0) {
          const start = Math.min(lastSelectedIndex, index);
          const end = Math.max(lastSelectedIndex, index);
          const newSelection = new Set<string>(selectedFiles);
          for (let i = start; i <= end; i++) newSelection.add(files[i].path);
          setSelectedFiles(newSelection);
          setSelectedFile(file);
      } else if (isCmd) {
          const newSelection = new Set<string>(selectedFiles);
          if (newSelection.has(file.path)) newSelection.delete(file.path);
          else newSelection.add(file.path);
          setSelectedFiles(newSelection);
          setSelectedFile(newSelection.size > 0 ? file : null);
          setLastSelectedIndex(index);
      } else {
          setSelectedFiles(new Set([file.path]));
          setSelectedFile(file);
          setLastSelectedIndex(index);
      }
      
      if (isImageFile(file.name) || isTextFile(file.name)) {
          setPreviewFile(file);
      } else {
          setPreviewFile(null);
      }
  };
  
  // Clear selection when path changes
  useEffect(() => {
      setSelectedFiles(new Set());
      setSelectedFile(null);
      setLastSelectedIndex(-1);
  }, [currentPath]);

  if (isLoading) {
    return (
      <div className={cn("h-full", className)}>
        <FileExplorerSkeleton />
      </div>
    );
  }

  return (
    <div className={cn("bg-card border border-border rounded-xl overflow-hidden flex flex-col h-full relative select-none shadow-sm", className)} ref={containerRef}>
      <FileExplorerHeader
        currentPath={currentPath || ''}
        onNavigate={onNavigate || (() => {})}
        onRefresh={onRefresh}
        onClearFilters={onClearFilters}
        onSuggestionClick={onSuggestionClick}
        onBatchRename={() => setShowBatchRename(true)}
        selectedCount={selectedFiles.size}
        activeFilters={activeFilters}
        quickPaths={quickPaths}
        recentPaths={recentPaths}
        suggestion={suggestion}
      />
      
      {/* File List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        {files.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2 p-4">
                <Folder className="w-10 h-10 stroke-1" />
                <p className="text-xs">No files listed</p>
            </div>
        ) : (
            <div className="flex flex-col">
                {files.map((file, idx) => (
                    <FileEntryRow
                        key={file.path + idx}
                        index={idx}
                        file={{
                           ...file,
                           size: folderSizes[file.path] !== undefined ? folderSizes[file.path] : file.size 
                        }}
                        isSelected={selectedFiles.has(file.path)}
                        onSelect={(multi) => handleClick(file, idx, multi, false)}
                        onDoubleClick={() => {
                            if (file.isDirectory && onNavigate) onNavigate(file.path);
                            else handleOpen(file);
                        }}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setContextMenu({ x: e.clientX, y: e.clientY, file });
                        }}
                        onDragStart={(e) => {
                             if (selectedFiles.has(file.path) && selectedFiles.size > 1) {
                                const paths = Array.from(selectedFiles).join('\n');
                                e.dataTransfer.setData("text/plain", paths);
                            } else {
                                e.dataTransfer.setData("text/plain", file.path);
                            }
                            e.dataTransfer.effectAllowed = "copy";
                        }}
                    />
                ))}
            </div>
        )}
      </div>

      {/* Quick Look Preview Panel */}
      <AnimatePresence>
          {previewFile && (isImageFile(previewFile.name) || isTextFile(previewFile.name)) && (
              <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute inset-x-0 bottom-0 bg-card border-t border-border p-3 flex flex-col gap-2 shadow-lg z-10"
              >
                  <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                          {isTextFile(previewFile.name) ? <FileText className="w-4 h-4 text-muted-foreground shrink-0" /> : <Eye className="w-4 h-4 text-muted-foreground shrink-0" />}
                          <span className="text-xs font-medium truncate text-foreground">{previewFile.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                          <button 
                              onClick={() => handleOpen(previewFile)}
                              className="p-1 hover:bg-secondary rounded transition-colors"
                              title="Open in default app"
                          >
                              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                          <button 
                              onClick={() => setPreviewFile(null)}
                              className="p-1 hover:bg-secondary rounded transition-colors"
                          >
                              <X className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                      </div>
                  </div>
                  <div className={cn(
                      "relative w-full bg-secondary rounded-lg overflow-hidden flex items-center justify-center",
                      isTextFile(previewFile.name) ? "h-48 items-start" : "aspect-video"
                  )}>
                      {isImageFile(previewFile.name) ? (
                            loadingImage ? (
                                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                    <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                    <span className="text-xs">Loading image...</span>
                                </div>
                            ) : imageDataUrl ? (
                                <img 
                                    src={imageDataUrl} 
                                    alt={previewFile.name}
                                    className="w-full h-full object-contain"
                                />
                            ) : (
                                <div className="text-muted-foreground text-xs flex flex-col items-center gap-1">
                                    <AlertCircle className="w-4 h-4" />
                                    <span>Failed to load image</span>
                                </div>
                            )
                      ) : (
                            loadingText ? (
                                <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
                                    <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                    <span className="text-xs">Loading text...</span>
                                </div>
                            ) : textContent ? (
                                <div className="w-full h-full p-3 overflow-auto text-[10px] font-mono leading-relaxed text-foreground whitespace-pre-wrap select-text">
                                    {textContent}
                                </div>
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-muted-foreground text-xs">
                                    <AlertCircle className="w-4 h-4" />
                                    <span>Failed to load content</span>
                                </div>
                            )
                      )}
                  </div>
              </motion.div>
          )}
      </AnimatePresence>

      <FileContextMenu
        contextMenu={contextMenu}
        onClose={() => setContextMenu(null)}
        onOpen={handleOpen}
        onReveal={handleReveal}
        onCopyPath={handleCopyPath}
        onQuickLook={setPreviewFile}
        onCalculateSize={handleCalculateSize}
        onSuggestionClick={onSuggestionClick}
        selectedFiles={selectedFiles}
        isImageFile={isImageFile}
      />

      <BatchRenameModal
        files={files.filter(f => selectedFiles.has(f.path))}
        isOpen={showBatchRename}
        onClose={() => setShowBatchRename(false)}
        onComplete={() => {
           onRefresh?.();
           setSelectedFiles(new Set());
        }}
      />
    </div>
  );
}
