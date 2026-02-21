import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import {
  PrepareBatchDownloadRequest,
  PrepareBatchDownloadResponse,
  PrepareBatchUploadRequest,
  PrepareBatchUploadResponse,
  FinalizeUploadRequest,
  UploadResponse,
  DownloadFileInfo,
  FileInfo,
} from './types';

// ============================================================================
// Download API Functions
// ============================================================================

/**
 * Request presigned URLs for batch download
 */
export async function requestPrepareBatchDownload(
  apiUrl: string,
  apiKey: string,
  request: PrepareBatchDownloadRequest
): Promise<PrepareBatchDownloadResponse> {
  const url = new URL('/api/deployments/prepare-batch-download', apiUrl);

  core.info(`Requesting download manifest for path: ${request.path}`);

  const response = await postJson<PrepareBatchDownloadResponse>(url, request, apiKey);

  return response;
}

/**
 * Download a file from a presigned URL
 */
export async function downloadFileFromPresignedUrl(
  downloadUrl: string,
  outputPath: string
): Promise<void> {
  const url = new URL(downloadUrl);
  const transport = url.protocol === 'https:' ? https : http;

  // Ensure directory exists
  const dir = path.dirname(outputPath);
  fs.mkdirSync(dir, { recursive: true });

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);

    const req = transport.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Handle redirects
        const redirectUrl = res.headers.location;
        if (redirectUrl) {
          file.close();
          fs.unlinkSync(outputPath);
          downloadFileFromPresignedUrl(redirectUrl, outputPath).then(resolve).catch(reject);
          return;
        }
      }

      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      } else {
        file.close();
        fs.unlinkSync(outputPath);
        reject(new Error(`Download failed: HTTP ${res.statusCode}`));
      }
    });

    req.on('error', (err) => {
      file.close();
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      reject(err);
    });

    file.on('error', (err) => {
      file.close();
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      reject(err);
    });
  });
}

/**
 * Download a file directly through the API (fallback for local storage)
 */
export async function downloadFileDirect(
  apiUrl: string,
  apiKey: string,
  filePath: string,
  outputPath: string,
  params: { repository: string; alias?: string; commitSha?: string; branch?: string }
): Promise<void> {
  const url = new URL(`/api/files/${filePath}`, apiUrl);

  url.searchParams.set('repository', params.repository);
  if (params.alias) url.searchParams.set('alias', params.alias);
  if (params.commitSha) url.searchParams.set('commitSha', params.commitSha);
  if (params.branch) url.searchParams.set('branch', params.branch);

  const transport = url.protocol === 'https:' ? https : http;

  // Ensure directory exists
  const dir = path.dirname(outputPath);
  fs.mkdirSync(dir, { recursive: true });

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);

    const req = transport.get(
      url,
      {
        headers: {
          'X-API-Key': apiKey,
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          res.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        } else {
          file.close();
          fs.unlinkSync(outputPath);
          reject(new Error(`Download failed for ${filePath}: HTTP ${res.statusCode}`));
        }
      }
    );

    req.on('error', (err) => {
      file.close();
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      reject(new Error(`Download failed for ${filePath}: ${err.message}`));
    });

    file.on('error', (err) => {
      file.close();
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      reject(err);
    });
  });
}

/**
 * Download files in parallel with concurrency limit
 */
export async function downloadFilesWithPresignedUrls(
  files: DownloadFileInfo[],
  outputDir: string,
  concurrency: number = 10,
  retries: number = 3
): Promise<{ success: string[]; failed: Array<{ path: string; error: string }> }> {
  const success: string[] = [];
  const failed: Array<{ path: string; error: string }> = [];

  // Process files in batches
  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency);

    const results = await Promise.allSettled(
      batch.map(async (file) => {
        const outputPath = path.join(outputDir, file.path);
        let lastError: Error | undefined;

        for (let attempt = 0; attempt < retries; attempt++) {
          try {
            await downloadFileFromPresignedUrl(file.downloadUrl, outputPath);
            return file.path;
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt < retries - 1) {
              // Exponential backoff: 1s, 2s, 4s
              const delay = Math.pow(2, attempt) * 1000;
              await new Promise((resolve) => setTimeout(resolve, delay));
            }
          }
        }

        throw lastError;
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        success.push(result.value);
      } else {
        const errorMatch = result.reason.message?.match(/for (.+?):/);
        const filePath = errorMatch?.[1] || 'unknown';
        failed.push({
          path: filePath,
          error: result.reason.message || 'Unknown error',
        });
      }
    }

    // Log progress
    const completed = success.length + failed.length;
    if (completed % 100 === 0 || completed === files.length) {
      core.info(`Download progress: ${completed}/${files.length} files`);
    }
  }

  return { success, failed };
}

/**
 * Download files directly through API (fallback)
 */
export async function downloadFilesDirect(
  apiUrl: string,
  apiKey: string,
  files: DownloadFileInfo[],
  outputDir: string,
  params: { repository: string; alias?: string; commitSha?: string; branch?: string },
  concurrency: number = 10,
  retries: number = 3
): Promise<{ success: string[]; failed: Array<{ path: string; error: string }> }> {
  const success: string[] = [];
  const failed: Array<{ path: string; error: string }> = [];

  // Process files in batches
  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency);

    const results = await Promise.allSettled(
      batch.map(async (file) => {
        const outputPath = path.join(outputDir, file.path);
        let lastError: Error | undefined;

        for (let attempt = 0; attempt < retries; attempt++) {
          try {
            await downloadFileDirect(apiUrl, apiKey, file.path, outputPath, params);
            return file.path;
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt < retries - 1) {
              // Exponential backoff: 1s, 2s, 4s
              const delay = Math.pow(2, attempt) * 1000;
              await new Promise((resolve) => setTimeout(resolve, delay));
            }
          }
        }

        throw lastError;
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        success.push(result.value);
      } else {
        const errorMatch = result.reason.message?.match(/for (.+?):/);
        const filePath = errorMatch?.[1] || 'unknown';
        failed.push({
          path: filePath,
          error: result.reason.message || 'Unknown error',
        });
      }
    }

    // Log progress
    const completed = success.length + failed.length;
    if (completed % 100 === 0 || completed === files.length) {
      core.info(`Download progress: ${completed}/${files.length} files`);
    }
  }

  return { success, failed };
}

// ============================================================================
// Upload API Functions
// ============================================================================

/**
 * Request presigned URLs for batch upload
 */
export async function requestPrepareBatchUpload(
  apiUrl: string,
  apiKey: string,
  request: PrepareBatchUploadRequest
): Promise<PrepareBatchUploadResponse> {
  const url = new URL('/api/deployments/prepare-batch-upload', apiUrl);

  core.info(`Requesting presigned URLs for ${request.files.length} files...`);

  const response = await postJson<PrepareBatchUploadResponse>(url, request, apiKey);

  return response;
}

/**
 * Finalize a batch upload
 */
export async function finalizeUpload(
  apiUrl: string,
  apiKey: string,
  request: FinalizeUploadRequest
): Promise<UploadResponse> {
  const url = new URL('/api/deployments/finalize-upload', apiUrl);

  core.info('Finalizing upload...');

  const response = await postJson<UploadResponse>(url, request, apiKey);

  return response;
}

/**
 * Upload a file directly to a presigned URL
 */
export async function uploadFileToPresignedUrl(
  presignedUrl: string,
  file: FileInfo
): Promise<void> {
  const url = new URL(presignedUrl);
  const transport = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const fileStream = fs.createReadStream(file.absolutePath);
    const stats = fs.statSync(file.absolutePath);

    const req = transport.request(
      url,
      {
        method: 'PUT',
        headers: {
          'Content-Type': file.contentType,
          'Content-Length': stats.size,
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          // Consume response body
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf-8');
            reject(
              new Error(
                `Upload failed for ${file.relativePath}: HTTP ${res.statusCode} - ${body.substring(0, 200)}`
              )
            );
          });
        }
      }
    );

    req.on('error', (err) => {
      reject(new Error(`Upload failed for ${file.relativePath}: ${err.message}`));
    });

    fileStream.pipe(req);
  });
}

/**
 * Upload files in parallel with concurrency limit
 */
export async function uploadFilesWithPresignedUrls(
  files: Array<{ file: FileInfo; presignedUrl: string }>,
  concurrency: number = 10,
  retries: number = 3
): Promise<{ success: string[]; failed: Array<{ path: string; error: string }> }> {
  const success: string[] = [];
  const failed: Array<{ path: string; error: string }> = [];

  // Process files in batches
  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency);

    const results = await Promise.allSettled(
      batch.map(async ({ file, presignedUrl }) => {
        let lastError: Error | undefined;

        for (let attempt = 0; attempt < retries; attempt++) {
          try {
            await uploadFileToPresignedUrl(presignedUrl, file);
            return file.relativePath;
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt < retries - 1) {
              // Exponential backoff: 1s, 2s, 4s
              const delay = Math.pow(2, attempt) * 1000;
              await new Promise((resolve) => setTimeout(resolve, delay));
            }
          }
        }

        throw lastError;
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        success.push(result.value);
      } else {
        const errorMatch = result.reason.message?.match(/for (.+?):/);
        const filePath = errorMatch?.[1] || 'unknown';
        failed.push({
          path: filePath,
          error: result.reason.message || 'Unknown error',
        });
      }
    }

    // Log progress
    const completed = success.length + failed.length;
    if (completed % 100 === 0 || completed === files.length) {
      core.info(`Upload progress: ${completed}/${files.length} files`);
    }
  }

  return { success, failed };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * POST JSON to an API endpoint
 */
async function postJson<T>(url: URL, body: unknown, apiKey: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const transport = url.protocol === 'https:' ? https : http;

    const req = transport.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
          'X-API-Key': apiKey,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const responseBody = Buffer.concat(chunks).toString('utf-8');

          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = JSON.parse(responseBody) as T;
              resolve(parsed);
            } catch {
              reject(new Error(`Failed to parse response: ${responseBody.substring(0, 200)}`));
            }
          } else {
            reject(
              new Error(
                `API request failed: HTTP ${res.statusCode} - ${responseBody.substring(0, 500)}`
              )
            );
          }
        });
      }
    );

    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}
