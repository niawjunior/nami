import { Folder, File, FileText, Image as ImageIcon, Music, Video, Code, Box, Search, X, Eye, ExternalLink, RefreshCw, ChevronLeft, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useState, useEffect, useRef, useCallback } from 'react';

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  lastModified: number;
}

interface FileExplorerProps {
  files: FileEntry[];
  currentPath?: string;
  className?: string;
  activeFilters?: string[];
  onClearFilters?: () => void;
  onNavigate?: (path: string) => void;
  onRefresh?: () => void;
}

const formatSize = (bytes: number) => {
    if (bytes === 0) return '--';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const isImageFile = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext || '');
};

const getFileIcon = (name: string, isDirectory: boolean) => {
  if (isDirectory) return <Folder className="w-4 h-4 text-blue-500" />;
  
  const ext = name.split('.').pop()?.toLowerCase();
  
  switch (ext) {
    case 'png': case 'jpg': case 'jpeg': case 'gif': case 'webp': case 'bmp': case 'svg':
      return <ImageIcon className="w-4 h-4 text-purple-500" />;
    case 'mp3': case 'wav': case 'aac': case 'flac':
      return <Music className="w-4 h-4 text-pink-500" />;
    case 'mp4': case 'mov': case 'avi': case 'mkv':
      return <Video className="w-4 h-4 text-red-500" />;
    case 'js': case 'ts': case 'tsx': case 'jsx': case 'json': case 'css': case 'html': case 'py': case 'go': case 'rs':
      return <Code className="w-4 h-4 text-amber-600" />;
    case 'pdf': case 'txt': case 'md': case 'doc': case 'docx':
      return <FileText className="w-4 h-4 text-gray-500" />;
    case 'zip': case 'tar': case 'gz': case 'rar': case '7z':
      return <Box className="w-4 h-4 text-orange-500" />;
    default:
      return <File className="w-4 h-4 text-gray-400" />;
  }
};

export function FileExplorer({ files, currentPath, className, activeFilters, onClearFilters, onNavigate, onRefresh }: FileExplorerProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, file: FileEntry } | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null);
  const [previewFile, setPreviewFile] = useState<FileEntry | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isTextFile = (name: string) => {
      const ext = name.split('.').pop()?.toLowerCase();
      return ['txt', 'md', 'json', 'yml', 'yaml', 'js', 'ts', 'tsx', 'jsx', 'css', 'html', 'log', 'sh', 'py', 'c', 'cpp', 'h', 'ini', 'conf', 'csv'].includes(ext || '');
  };

  // Close context menu on click elsewhere
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  // Load image as base64 when preview file changes
  useEffect(() => {
      if (previewFile && isImageFile(previewFile.name)) {
          setLoadingImage(true);
          setImageDataUrl(null);
          window.electron?.readImageAsBase64(previewFile.path)
              .then((dataUrl) => {
                  setImageDataUrl(dataUrl);
                  setLoadingImage(false);
              })
              .catch(() => {
                  setLoadingImage(false);
              });
      } else {
          setImageDataUrl(null);
      }
  }, [previewFile]);

  // Load text content when preview file changes
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

  // Keyboard shortcuts
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          // Ignore keyboard shortcuts when typing in input/textarea
          const tag = document.activeElement?.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA') return;
          
          if (e.key === 'Escape') {
              setPreviewFile(null);
              setContextMenu(null);
          }
          if (e.key === ' ' && selectedFile && isImageFile(selectedFile.name)) {
              e.preventDefault();
              setPreviewFile(prev => prev ? null : selectedFile);
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFile]);

  const handleContextMenu = (e: React.MouseEvent, file: FileEntry) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, file });
  };

  const handleOpen = async (file: FileEntry) => {
      try {
          if (window.electron?.openPath) {
              await window.electron.openPath(file.path);
          }
      } catch (err) {
          console.error("Failed to open file:", err);
      }
      setContextMenu(null);
  };

  const handleReveal = async (path: string) => {
      try {
          if (window.electron?.showItemInFolder) {
              await window.electron.showItemInFolder(path);
          }
      } catch (err) {
          console.error("Failed to reveal:", err);
      }
      setContextMenu(null);
  };
  
  const handleCopyPath = (path: string) => {
      navigator.clipboard.writeText(path);
      setContextMenu(null);
  };

  const handleClick = (file: FileEntry) => {
      setSelectedFile(file);
      // Auto-preview images or text on click
      if (isImageFile(file.name) || isTextFile(file.name)) {
          setPreviewFile(file);
      } else {
          setPreviewFile(null);
      }
  };

  return (
    <div className={cn("bg-card border border-border rounded-xl overflow-hidden flex flex-col h-full relative select-none shadow-sm", className)} ref={containerRef}>
      {/* Header */}
      <div className="p-3 border-b border-border bg-secondary/50 flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm flex items-center gap-2 text-foreground">
                {/* Back button */}
                {currentPath && currentPath !== '/' && onNavigate && (
                    <button 
                        onClick={() => {
                            const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
                            onNavigate(parentPath);
                        }}
                        className="p-1 hover:bg-secondary rounded transition-colors -ml-1"
                        title="Go back"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                )}
                <Folder className="w-4 h-4 text-blue-500" />
                File Explorer
            </h3>
            {/* Refresh button */}
            {onRefresh && (
                <button 
                    onClick={onRefresh}
                    className="p-1.5 hover:bg-secondary rounded transition-colors"
                    title="Refresh"
                >
                    <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
            )}
        </div>
        {currentPath && (
            <p className="text-[10px] text-muted-foreground truncate font-mono" title={currentPath}>
                {currentPath}
            </p>
        )}
        {/* Active Filters */}
        {activeFilters && activeFilters.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
                {activeFilters.map(filter => (
                    <span 
                        key={filter}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-medium rounded-full"
                    >
                        .{filter}
                        {onClearFilters && (
                            <button 
                                onClick={onClearFilters}
                                className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"
                                title="Clear filter"
                            >
                                <X className="w-2.5 h-2.5" />
                            </button>
                        )}
                    </span>
                ))}
            </div>
        )}
      </div>

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
                    <motion.div
                        key={file.path + idx}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: Math.min(idx * 0.01, 0.5) }}
                        onClick={() => handleClick(file)}
                        onContextMenu={(e) => handleContextMenu(e, file)}
                        onDoubleClick={() => {
                            if (file.isDirectory && onNavigate) {
                                onNavigate(file.path);
                            } else {
                                handleOpen(file);
                            }
                        }}
                        className={cn(
                            "group flex items-center gap-2 px-3 py-1.5 cursor-default transition-colors border-b border-border/50 text-xs",
                            selectedFile?.path === file.path 
                                ? "bg-primary/10 text-primary" 
                                : "hover:bg-secondary"
                        )}
                    >
                        <div className="shrink-0">{getFileIcon(file.name, file.isDirectory)}</div>
                        <div className="flex-1 min-w-0 truncate font-medium text-foreground">
                            {file.name || '(unnamed)'}
                        </div>
                        <div className="shrink-0 text-[10px] text-muted-foreground font-mono">
                            {file.isDirectory ? '' : formatSize(file.size)}
                        </div>
                    </motion.div>
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


      {/* Context Menu */}
      <AnimatePresence>
          {contextMenu && (
              <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.1 }}
                  style={{ 
                      top: Math.min(contextMenu.y, (window.innerHeight) - 150), 
                      left: Math.min(contextMenu.x, (window.innerWidth) - 180) 
                  }}
                  className="fixed z-50 w-44 bg-popover border border-border rounded-lg shadow-lg overflow-hidden py-1"
              >
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground border-b border-border mb-1 truncate">
                      {contextMenu.file.name}
                  </div>
                  <button onClick={() => handleOpen(contextMenu.file)} className="w-full text-left px-3 py-1.5 text-xs hover:bg-secondary transition-colors flex items-center gap-2">
                       <ExternalLink className="w-3.5 h-3.5" /> Open
                  </button>
                  {isImageFile(contextMenu.file.name) && (
                      <button onClick={() => { setPreviewFile(contextMenu.file); setContextMenu(null); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-secondary transition-colors flex items-center gap-2">
                           <Eye className="w-3.5 h-3.5" /> Quick Look
                      </button>
                  )}
                  <button onClick={() => handleReveal(contextMenu.file.path)} className="w-full text-left px-3 py-1.5 text-xs hover:bg-secondary transition-colors flex items-center gap-2">
                       <Search className="w-3.5 h-3.5" /> Show in Finder
                  </button>
                  <div className="h-px bg-border my-1" />
                  <button onClick={() => handleCopyPath(contextMenu.file.path)} className="w-full text-left px-3 py-1.5 text-xs hover:bg-secondary transition-colors flex items-center gap-2">
                       <FileText className="w-3.5 h-3.5" /> Copy Path
                  </button>
              </motion.div>
          )}
      </AnimatePresence>
    </div>
  );
}
