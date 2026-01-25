'use client';

import { motion } from 'framer-motion';
import { Trash2, Check, FileText, Image as ImageIcon, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ImageThumbnail } from '../file-browser/ImageThumbnail';

interface DuplicateGroup {
  hash: string;
  size: number;
  files: string[];
}

interface DuplicateReviewProps {
  duplicates: DuplicateGroup[];
  onKeep: (path: string) => void;
  onDelete: (path: string) => void;
  onDeleteAll: (paths: string[]) => void;
  onClose: () => void;
}

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const isImageFile = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase();
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext || '');
};

const getFileName = (path: string) => path.split('/').pop() || path;
const getFolder = (path: string) => {
  const parts = path.split('/');
  return parts.slice(0, -1).join('/');
};

export function DuplicateReview({ duplicates, onKeep, onDelete, onDeleteAll, onClose }: DuplicateReviewProps) {
  if (duplicates.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <Check className="w-10 h-10 mx-auto mb-2 text-green-500" />
        <p className="font-medium">No duplicates found!</p>
        <p className="text-sm">Your files are all unique.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border bg-secondary/50 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-foreground">Duplicate Files Review</h2>
          <p className="text-xs text-muted-foreground">
            Found {duplicates.length} groups with {duplicates.reduce((acc, d) => acc + d.files.length, 0)} total files
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-secondary rounded transition-colors"
          title="Close"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Duplicate Groups */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {duplicates.map((group, groupIdx) => (
          <motion.div
            key={group.hash}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: groupIdx * 0.05 }}
            className="bg-secondary/30 rounded-lg p-3 border border-border/50"
          >
            {/* Group Header */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">
                {group.files.length} identical files • {formatSize(group.size)} each
              </span>
              <button
                onClick={() => {
                  // Keep first, delete rest
                  const [keep, ...toDelete] = group.files;
                  onDeleteAll(toDelete);
                }}
                className="text-xs px-2 py-1 bg-primary/10 hover:bg-primary/20 text-primary rounded transition-colors"
              >
                Keep first, delete rest
              </button>
            </div>

            {/* Files in group */}
            <div className="space-y-1.5">
              {group.files.map((filePath, fileIdx) => (
                <div
                  key={filePath}
                  className="flex items-center gap-2 p-2 bg-card rounded border border-border/50"
                >
                  {/* Thumbnail or Icon */}
                  <div className="shrink-0">
                    {isImageFile(filePath) ? (
                      <ImageThumbnail path={filePath} name={getFileName(filePath)} size={40} className="rounded" />
                    ) : (
                      <div className="w-10 h-10 flex items-center justify-center bg-secondary rounded">
                        <FileText className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                  </div>

                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {getFileName(filePath)}
                      {fileIdx === 0 && <span className="text-xs text-green-500 ml-1">(Original)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground truncate" title={getFolder(filePath)}>
                      {getFolder(filePath)}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => onKeep(filePath)}
                      className="p-1.5 hover:bg-green-500/20 text-green-500 rounded transition-colors"
                      title="Keep this file"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDelete(filePath)}
                      className="p-1.5 hover:bg-red-500/20 text-red-500 rounded transition-colors"
                      title="Delete this file"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
