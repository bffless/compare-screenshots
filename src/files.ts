import * as fs from 'fs';
import * as path from 'path';
import * as mimeTypes from 'mime-types';
import { FileInfo } from '@bffless/artifact-client';

/**
 * Recursively walk a directory and collect all files
 * Skips hidden files and system files
 */
export async function walkDirectory(dirPath: string, basePath: string): Promise<FileInfo[]> {
  const files: FileInfo[] = [];
  await walkRecursive(dirPath, basePath, dirPath, files);
  return files;
}

async function walkRecursive(
  currentPath: string,
  basePath: string,
  rootPath: string,
  files: FileInfo[]
): Promise<void> {
  const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(currentPath, entry.name);

    // Skip hidden files and directories
    if (entry.name.startsWith('.')) {
      continue;
    }

    // Skip common system directories
    if (entry.name === '__MACOSX' || entry.name === 'node_modules') {
      continue;
    }

    if (entry.isDirectory()) {
      await walkRecursive(fullPath, basePath, rootPath, files);
    } else if (entry.isFile()) {
      const stat = await fs.promises.stat(fullPath);

      // Build relative path that preserves directory structure
      // relativePath includes basePath prefix: e.g., "screenshots/home.png"
      const pathFromRoot = path.relative(rootPath, fullPath);
      const relativePath = path.join(basePath, pathFromRoot).replace(/\\/g, '/');

      // Detect MIME type
      const contentType = mimeTypes.lookup(entry.name) || 'application/octet-stream';

      files.push({
        absolutePath: fullPath,
        relativePath,
        size: stat.size,
        contentType,
      });
    }
  }
}

/**
 * Validate that a directory exists and is not empty
 */
export function validateDirectory(dirPath: string, workingDirectory: string = '.'): string {
  const resolvedPath = path.resolve(workingDirectory, dirPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Directory does not exist: ${resolvedPath}`);
  }

  const stat = fs.statSync(resolvedPath);
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${resolvedPath}`);
  }

  return resolvedPath;
}
