'use client';

import { useState } from 'react';
import { FileEntry } from './FileExplorer';

export function useFolderSizes() {
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

    return { folderSizes, handleCalculateSize };
}
