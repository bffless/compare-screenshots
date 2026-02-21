import { PrepareBatchDownloadRequest, PrepareBatchDownloadResponse, PrepareBatchUploadRequest, PrepareBatchUploadResponse, FinalizeUploadRequest, UploadResponse, DownloadFileInfo, FileInfo } from './types';
/**
 * Request presigned URLs for batch download
 */
export declare function requestPrepareBatchDownload(apiUrl: string, apiKey: string, request: PrepareBatchDownloadRequest): Promise<PrepareBatchDownloadResponse>;
/**
 * Download a file from a presigned URL
 */
export declare function downloadFileFromPresignedUrl(downloadUrl: string, outputPath: string): Promise<void>;
/**
 * Download a file directly through the API (fallback for local storage)
 */
export declare function downloadFileDirect(apiUrl: string, apiKey: string, filePath: string, outputPath: string, params: {
    repository: string;
    alias?: string;
    commitSha?: string;
    branch?: string;
}): Promise<void>;
/**
 * Download files in parallel with concurrency limit
 */
export declare function downloadFilesWithPresignedUrls(files: DownloadFileInfo[], outputDir: string, concurrency?: number, retries?: number): Promise<{
    success: string[];
    failed: Array<{
        path: string;
        error: string;
    }>;
}>;
/**
 * Download files directly through API (fallback)
 */
export declare function downloadFilesDirect(apiUrl: string, apiKey: string, files: DownloadFileInfo[], outputDir: string, params: {
    repository: string;
    alias?: string;
    commitSha?: string;
    branch?: string;
}, concurrency?: number, retries?: number): Promise<{
    success: string[];
    failed: Array<{
        path: string;
        error: string;
    }>;
}>;
/**
 * Request presigned URLs for batch upload
 */
export declare function requestPrepareBatchUpload(apiUrl: string, apiKey: string, request: PrepareBatchUploadRequest): Promise<PrepareBatchUploadResponse>;
/**
 * Finalize a batch upload
 */
export declare function finalizeUpload(apiUrl: string, apiKey: string, request: FinalizeUploadRequest): Promise<UploadResponse>;
/**
 * Upload a file directly to a presigned URL
 */
export declare function uploadFileToPresignedUrl(presignedUrl: string, file: FileInfo): Promise<void>;
/**
 * Upload files in parallel with concurrency limit
 */
export declare function uploadFilesWithPresignedUrls(files: Array<{
    file: FileInfo;
    presignedUrl: string;
}>, concurrency?: number, retries?: number): Promise<{
    success: string[];
    failed: Array<{
        path: string;
        error: string;
    }>;
}>;
