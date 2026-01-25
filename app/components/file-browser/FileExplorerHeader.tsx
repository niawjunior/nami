'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Folder, Search, X, RefreshCw, ChevronLeft, Home, Monitor, Download, FileText, Clock, Pencil, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '../ThemeToggle';

interface QuickPath {
  name: string;
  path: string;
  icon: any;
}

interface FileExplorerHeaderProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  onRefresh?: () => void;
  onClearFilters?: () => void;
  onSuggestionClick?: (message: string) => void;
  onBatchRename?: () => void;
  selectedCount: number;
  activeFilters?: string[];
  quickPaths: QuickPath[];
  recentPaths: string[];
  suggestion: { message: string; subtext: string; prompt: string } | null;
}

export function FileExplorerHeader({
  currentPath,
  onNavigate,
  onRefresh,
  onClearFilters,
  onSuggestionClick,
  onBatchRename,
  selectedCount,
  activeFilters,
  quickPaths,
  recentPaths,
  suggestion
}: FileExplorerHeaderProps) {
  
  return (
    <div className="p-3 border-b border-border bg-secondary/50 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2 text-foreground">
              {/* Back button */}
              {currentPath && currentPath !== '/' && (
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
              {/* Selection count badge */}
              {selectedCount > 1 && (
                  <span className="px-1.5 py-0.5 bg-primary text-primary-foreground text-[10px] font-medium rounded-full">
                      {selectedCount} selected
                  </span>
              )}
          </h3>
          {/* Header Actions */}
          <div className="flex items-center gap-1">
              {selectedCount > 1 && onBatchRename && (
                  <button
                      onClick={onBatchRename}
                      className="p-1.5 hover:bg-secondary rounded transition-colors text-primary"
                      title="Batch Rename"
                  >
                      <Pencil className="w-3.5 h-3.5" />
                  </button>
              )}

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
          <ThemeToggle />
      </div>
    </div>
      
      {/* Suggestion Chip */}
      <AnimatePresence>
          {suggestion && onSuggestionClick && (
              <motion.button
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  onClick={() => onSuggestionClick(suggestion.prompt)}
                  className="flex items-center justify-between w-full px-3 py-2 bg-primary/10 hover:bg-primary/15 border border-primary/20 rounded-lg text-left group transition-colors mb-1"
              >
                  <div className="flex items-center gap-2 overflow-hidden">
                      <Sparkles className="w-3.5 h-3.5 text-primary shrink-0 animate-pulse" />
                      <div className="flex flex-col truncate">
                          <span className="text-[10px] font-semibold text-primary truncate">{suggestion.message}</span>
                          <span className="text-[10px] text-primary/80 truncate">{suggestion.subtext}</span>
                      </div>
                  </div>
              </motion.button>
          )}
      </AnimatePresence>

      {/* Quick Access Bar */}
      <div className="flex items-center gap-1 px-2 py-1 bg-muted/10 border-b border-border/30 overflow-x-auto no-scrollbar">
          {quickPaths.map(qp => (
              <button
                  key={qp.name}
                  onClick={() => onNavigate(qp.path)}
                  className={cn(
                      "flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition-colors whitespace-nowrap",
                      currentPath === qp.path 
                          ? "bg-primary/10 text-primary" 
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  title={qp.path}
              >
                  <qp.icon className="w-3 h-3" />
                  {qp.name}
              </button>
          ))}
          {/* Recent Locations Divider & Chips */}
          {recentPaths.filter(rp => !quickPaths.some(qp => qp.path === rp)).length > 0 && (
              <>
                  <div className="h-4 w-px bg-border/50 mx-1" />
                  <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                  {recentPaths
                      .filter(rp => !quickPaths.some(qp => qp.path === rp))
                      .slice(0, 3) // Show max 3 recent
                      .map(rp => {
                          const folderName = rp.split('/').pop() || rp;
                          return (
                              <button
                                  key={rp}
                                  onClick={() => onNavigate(rp)}
                                  className={cn(
                                      "flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors whitespace-nowrap",
                                      currentPath === rp
                                          ? "bg-primary/10 text-primary"
                                          : "text-muted-foreground/70 hover:bg-muted hover:text-foreground"
                                  )}
                                  title={rp}
                              >
                                  <Folder className="w-3 h-3" />
                                  {folderName}
                              </button>
                          );
                      })}
              </>
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
  );
}
