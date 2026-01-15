export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  lastModified: number;
  _meta?: string;
}
