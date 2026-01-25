'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { FileEntry } from './FileExplorer';
import { ImageThumbnail } from './ImageThumbnail';
import { Folder, File, FileText, Image as ImageIcon, Music, Video, Code, Box } from 'lucide-react';

interface FileEntryRowProps {
  file: FileEntry;
  isSelected: boolean;
  onSelect: (multi: boolean) => void;
  onDragStart: (e: React.DragEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  index: number;
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

export function FileEntryRow({
  file,
  isSelected,
  onSelect,
  onDragStart,
  onContextMenu,
  onDoubleClick,
  index
}: FileEntryRowProps) {
  return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03, duration: 0.2 }}
            className="w-full"
        >
        <div
            onClick={(e) => {
                e.stopPropagation();
                onSelect(e.shiftKey || e.metaKey || e.ctrlKey);
            }}
            onDoubleClick={(e) => {
                e.stopPropagation();
                onDoubleClick();
            }}
            onContextMenu={onContextMenu}
            draggable
            onDragStart={onDragStart}
            className={cn(
                "group flex items-center gap-2 px-3 py-1.5 cursor-default transition-colors border-b border-border/50 text-xs w-full",
                isSelected 
                    ? "bg-primary/10 text-primary" 
                    : "hover:bg-secondary"
            )}
        >
            <div className="shrink-0">
                {isImageFile(file.name) ? (
                    <ImageThumbnail path={file.path} name={file.name} size={20} className="rounded-sm" />
                ) : (
                    getFileIcon(file.name, file.isDirectory)
                )}
            </div>
            <div className="flex-1 min-w-0 truncate font-medium text-foreground">
                {file.name || '(unnamed)'}
            </div>
            <div className="shrink-0 text-[10px] text-muted-foreground font-mono">
                {file.isDirectory 
                    ? `${typeof file.childCount === 'number' ? file.childCount : '?'} items` 
                    : formatSize(file.size)}
            </div>
        </div>
        </motion.div>
  );
}
