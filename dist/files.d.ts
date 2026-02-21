import { FileInfo } from '@bffless/artifact-client';
/**
 * Recursively walk a directory and collect all files
 * Skips hidden files and system files
 */
export declare function walkDirectory(dirPath: string, basePath: string): Promise<FileInfo[]>;
/**
 * Validate that a directory exists and is not empty
 */
export declare function validateDirectory(dirPath: string, workingDirectory?: string): string;
