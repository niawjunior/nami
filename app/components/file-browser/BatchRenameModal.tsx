'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Type, Wand2, Hash, ArrowRight, Check, AlertCircle } from 'lucide-react';
import { FileEntry } from './FileExplorer';
import { cn } from '@/lib/utils';
import { ImageThumbnail } from './ImageThumbnail';

interface BatchRenameModalProps {
  files: FileEntry[];
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

type RenameMode = 'replace' | 'pattern';

export function BatchRenameModal({ files, isOpen, onClose, onComplete }: BatchRenameModalProps) {
  const [mode, setMode] = useState<RenameMode>('replace');
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [pattern, setPattern] = useState('New Name {n}');
  const [startNumber, setStartNumber] = useState(1);
  const [isRenaming, setIsRenaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter only files (directories usually safer to handle separately or same way?)
  // Let's assume we allow both, as fs.rename works for both.
  
  // Sort files by name for consistent numbering
  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  }, [files]);

  // Compute previews
  const previews = useMemo(() => {
    return sortedFiles.map((file, index) => {
      let newName = file.name;
      const ext = file.name.includes('.') ? `.${file.name.split('.').pop()}` : '';
      const baseName = file.name.includes('.') ? file.name.substring(0, file.name.lastIndexOf('.')) : file.name;

      if (mode === 'replace') {
        if (findText) {
          // Global replace? or single? usually global in filenames
          newName = file.name.replaceAll(findText, replaceText);
        }
      } else if (mode === 'pattern') {
        // Pattern: {n} for number, {ext} for extension, {name} for original name
        const num = startNumber + index;
        const numStr = num.toString().padStart(String(files.length + startNumber).length, '0'); // Auto-pad
        
        let p = pattern
          .replace(/{n}/g, numStr)
          .replace(/{name}/g, baseName)
          .replace(/{ext}/g, ext);
          
        // If pattern doesn't include {ext} but file has one, and not overriding, maybe append?
        // Usually user puts extension in pattern or we assume it preserves extension unless typed.
        // Let's keep it simple: if pattern doesn't end with extension, append original extension
        // ONLY if the pattern replaced name.
        // Actually standard behavior: preserve extension unless specified.
        if (!p.toLowerCase().endsWith(ext.toLowerCase()) && ext) {
             p += ext;
        }
        newName = p;
      }
      
      return {
        original: file,
        newName,
        changed: newName !== file.name,
        path: file.path,
        newPath: file.path.replace(file.name, newName) // Simple path replacement
      };
    });
  }, [sortedFiles, mode, findText, replaceText, pattern, startNumber, files.length]);

  const handleRename = async () => {
    if (isRenaming) return;
    setIsRenaming(true);
    setError(null);

    try {
      // Prepare operations
      const operations = previews
        .filter(p => p.changed)
        .map(p => ({
            original: p.path,
            new: p.newPath
        }));

      if (operations.length === 0) {
        onClose();
        return;
      }

      const result = await window.electron.batchRename(operations);
      
      if (result.errors && result.errors.length > 0) {
          // Show partial error
          setError(`Renamed ${result.success.length} files. Errors: ${result.errors.slice(0, 2).join(', ')}...`);
      } else {
          onComplete();
          onClose();
      }
    } catch (err: any) {
        setError(err.message);
    } finally {
        setIsRenaming(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={onClose}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card w-full max-w-2xl max-h-[85vh] rounded-xl shadow-2xl overflow-hidden flex flex-col border border-border"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-4 border-b border-border flex items-center justify-between bg-secondary/30">
                <h2 className="font-semibold text-foreground flex items-center gap-2">
                  <Wand2 className="w-4 h-4 text-primary" />
                  Batch Rename ({files.length} items)
                </h2>
                <button onClick={onClose} className="p-1 hover:bg-secondary rounded text-muted-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Controls */}
              <div className="p-4 grid gap-4 bg-card z-10">
                <div className="flex bg-secondary/50 p-1 rounded-lg w-fit">
                    <button
                        onClick={() => setMode('replace')}
                        className={cn(
                            "px-3 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-2",
                            mode === 'replace' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <Type className="w-4 h-4" />
                        Find & Replace
                    </button>
                    <button
                        onClick={() => setMode('pattern')}
                        className={cn(
                            "px-3 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-2",
                            mode === 'pattern' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <Hash className="w-4 h-4" />
                        Pattern
                    </button>
                </div>

                {mode === 'replace' ? (
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Find</label>
                            <input
                                type="text"
                                value={findText}
                                onChange={e => setFindText(e.target.value)}
                                placeholder="Text to find..."
                                className="w-full px-3 py-2 bg-secondary/30 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                autoFocus
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Replace with</label>
                            <input
                                type="text"
                                value={replaceText}
                                onChange={e => setReplaceText(e.target.value)}
                                placeholder="Replacement text..."
                                className="w-full px-3 py-2 bg-secondary/30 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-3 gap-4">
                        <div className="col-span-2 space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Pattern</label>
                            <input
                                type="text"
                                value={pattern}
                                onChange={e => setPattern(e.target.value)}
                                placeholder="Name {n}"
                                className="w-full px-3 py-2 bg-secondary/30 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                            <p className="text-[10px] text-muted-foreground">Use {'{n}'} for number, {'{name}'} for original name.</p>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Start Number</label>
                            <input
                                type="number"
                                value={startNumber}
                                onChange={e => setStartNumber(parseInt(e.target.value) || 1)}
                                className="w-full px-3 py-2 bg-secondary/30 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                        </div>
                    </div>
                )}
              </div>

              {/* Preview List */}
              <div className="flex-1 overflow-y-auto bg-secondary/10 border-t border-border">
                <table className="w-full text-sm text-left">
                    <thead className="bg-secondary/50 text-xs text-muted-foreground font-medium sticky top-0 z-10 backdrop-blur">
                        <tr>
                            <th className="px-4 py-2 font-medium w-1/2">Original Name</th>
                            <th className="px-4 py-2 font-medium w-1/2">New Name</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                        {previews.map((item, i) => (
                            <tr key={i} className="group hover:bg-secondary/30 transition-colors">
                                <td className="px-4 py-2 text-muted-foreground truncate max-w-[200px]" title={item.original.name}>
                                    {item.original.name}
                                </td>
                                <td className="px-4 py-2 truncate max-w-[200px]">
                                    <div className="flex items-center gap-2">
                                        <ArrowRight className={cn("w-3 h-3 shrink-0", item.changed ? "text-primary" : "text-border")} />
                                        <span className={cn(
                                            "font-mono", 
                                            item.changed ? "text-foreground font-medium" : "text-muted-foreground/50"
                                        )}>
                                            {item.newName}
                                        </span>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-border bg-card flex items-center justify-between gap-4">
                <div className="flex-1">
                    {error && (
                        <div className="flex items-center gap-2 text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            {error}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleRename}
                        disabled={isRenaming || !previews.some(p => p.changed)}
                        className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isRenaming ? (
                            <>Renaming...</>
                        ) : (
                            <>
                                <Check className="w-4 h-4" />
                                Rename {previews.filter(p => p.changed).length} files
                            </>
                        )}
                    </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
