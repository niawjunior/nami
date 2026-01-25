'use client';

import { useEffect } from 'react';
import { FileEntry } from './FileExplorer';

const isImageFile = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext || '');
};

const isTextFile = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    return ['txt', 'md', 'json', 'yml', 'yaml', 'js', 'ts', 'tsx', 'jsx', 'css', 'html', 'log', 'sh', 'py', 'c', 'cpp', 'h', 'ini', 'conf', 'csv'].includes(ext || '');
};

interface UseFileExplorerHotkeysProps {
    files: FileEntry[];
    selectedFiles: Set<string>;
    onNavigate?: (path: string) => void;
    onSuggestionClick?: (message: string) => void;
    setPreviewFile: (file: FileEntry | null | ((prev: FileEntry | null) => FileEntry | null)) => void;
    setContextMenu: (menu: any) => void;
    clearSelection: () => void;
}

export function useFileExplorerHotkeys({
    files,
    selectedFiles,
    onNavigate,
    onSuggestionClick,
    setPreviewFile,
    setContextMenu,
    clearSelection
}: UseFileExplorerHotkeysProps) {

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const tag = document.activeElement?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            
            if (e.key === 'Escape') {
                setPreviewFile(null);
                setContextMenu(null);
                clearSelection();
            }
            // Space to toggle preview
            if (e.key === ' ' && selectedFiles.size === 1) {
                e.preventDefault();
                const selectedPath = Array.from(selectedFiles)[0];
                const file = files.find(f => f.path === selectedPath);
                if (file && (isImageFile(file.name) || isTextFile(file.name))) {
                    // This logic is slightly simplistic (setPreviewFile logic from component had prev check).
                    // We can accept a callback or check current preview state if needed, 
                    // but for simplicity, we'll assume the parent handles toggling via setPreviewFile logic if we pass the setter.
                    // Actually, to implement "toggle", we need to know if it is already open. 
                    // Let's assume setPreviewFile can take a function update.
                    setPreviewFile((prev: FileEntry | null) => prev ? null : file);
                }
            }
            if (e.key === 'Enter' && selectedFiles.size === 1) {
                const selectedPath = Array.from(selectedFiles)[0];
                const file = files.find(f => f.path === selectedPath);
                if (file) {
                    e.preventDefault();
                    if (file.isDirectory && onNavigate) onNavigate(file.path);
                    else window.electron?.openPath(file.path);
                }
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
    }, [files, selectedFiles, onNavigate, onSuggestionClick, clearSelection, setPreviewFile, setContextMenu]);
}
