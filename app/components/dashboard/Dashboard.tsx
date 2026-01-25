'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { StorageChart } from './StorageChart';
import { RecentFilesGrid } from './RecentFilesGrid';
import { FileEntry } from '../file-browser/FileExplorer';
import { RefreshCw, Search, ArrowRight, Loader2, Sparkles, Download, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DashboardProps {
  onNavigate: (path: string) => void;
  onOpen: (path: string) => void;
}

interface DashboardStats {
  types: Record<string, number>;
  totalSize: number;
  fileCount: number;
}

export function Dashboard({ onNavigate, onOpen }: DashboardProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentFiles, setRecentFiles] = useState<FileEntry[]>([]);
  const [homePath, setHomePath] = useState<string>('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
        const desktopPath = await window.electron.getDesktopPath();
        const separator = desktopPath.includes('\\') ? '\\' : '/';
        const home = desktopPath.substring(0, desktopPath.lastIndexOf(separator)); // Guessing home from desktop
        setHomePath(home);
        
        // 1. Get Stats for Home/Downloads (High value target)
        const downloadsPath = `${home}${separator}Downloads`;
        const stats = await window.electron.getDirectoryStats(downloadsPath);
        
        setStats({
            types: stats.types,
            totalSize: stats.totalSize,
            fileCount: stats.fileCount
        });

        // 2. Get Recent Files
        const recentResult = await window.electron.listFiles({
            path: downloadsPath,
            sort: 'newest'
        });
        
        if (recentResult.success && recentResult.files) {
            setRecentFiles(recentResult.files.slice(0, 8)); // Top 8 for the grid
        }

    } catch (error) {
        console.error("Dashboard load error:", error);
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-background/50 p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
          <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
                  Welcome back
              </h1>
              <p className="text-muted-foreground text-sm">Here's what's happening in your digital space.</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="h-8 gap-2">
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
              Refresh
          </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Main Column (2/3) */}
          <div className="md:col-span-8 flex flex-col gap-6">
              {/* Recent Files Section */}
              <div className="space-y-4">
                  <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                          <div className="p-1 bg-primary/10 rounded-md">
                             <Download className="w-4 h-4 text-primary" />
                          </div>
                          <h3 className="text-sm font-semibold">Recent Downloads</h3>
                      </div>
                      <Button variant="ghost" className="text-xs h-auto p-0 hover:bg-transparent hover:text-primary transition-colors" onClick={() => onNavigate(`${homePath}/Downloads`)}>
                          View all <ArrowRight className="w-3 h-3 ml-1" />
                      </Button>
                  </div>
                  <RecentFilesGrid files={recentFiles} onNavigate={onNavigate} onOpen={onOpen} />
              </div>
          </div>

          {/* Sidebar Column (1/3) */}
          <div className="md:col-span-4 flex flex-col gap-6">
             {/* Storage Card */}
             <StorageChart stats={stats} loading={loading} />
             
             {/* Quick Actions Card */}
             <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                 <div className="flex items-center gap-2 mb-4">
                     <Sparkles className="w-4 h-4 text-amber-500" />
                     <h3 className="text-sm font-semibold">Quick Actions</h3>
                 </div>
                 
                 <div className="grid grid-cols-1 gap-2">
                     <Button variant="outline" className="w-full justify-start h-10 text-xs font-medium border-border/50 hover:bg-secondary/50 hover:border-border" onClick={() => onNavigate(`${homePath}/Downloads`)}>
                        <Download className="w-3.5 h-3.5 mr-2 text-blue-500" /> 
                        Organize Downloads
                     </Button>
                     <Button variant="outline" className="w-full justify-start h-10 text-xs font-medium border-border/50 hover:bg-secondary/50 hover:border-border" onClick={() => onNavigate(`${homePath}/Desktop`)}>
                        <Monitor className="w-3.5 h-3.5 mr-2 text-purple-500" />
                        Clean Desktop
                     </Button>
                 </div>
             </div>
          </div>
      </div>
    </div>
  );
}
