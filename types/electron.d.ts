import { FileEntry } from '@/app/components/file-browser/FileExplorer';

export interface ListFilesResult {
  success: boolean;
  files?: FileEntry[];
  error?: string;
}

export interface ElectronAPI {
  getApiPort: () => Promise<number>;
  getDesktopPath: () => Promise<string>;
  watchDirectory: (path: string) => Promise<{ success: boolean; error?: string }>;
  onDirectoryChanged: (callback: (path: string) => void) => void;
  openPath: (path: string) => Promise<string>;
  showItemInFolder: (path: string) => Promise<void>;
  readTextFile: (path: string) => Promise<string>;
  readImageAsBase64: (path: string) => Promise<string | null>;
  listFiles: (args: { path: string; extensions?: string[] }) => Promise<ListFilesResult>;
  batchRename: (operations: { original: string; new: string }[]) => Promise<{ success: string[]; errors: string[] }>;
  getFolderSize: (path: string) => Promise<number>;
  getPathForFile: (file: File) => string;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}
