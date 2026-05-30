import * as core from '@actions/core';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import { URL } from 'url';
import archiver from 'archiver';
import FormData from 'form-data';
import {
  ActionInputs,
  ComparisonReport,
  GitContext,
  UploadResult,
  UploadResponse,
} from './types';
import { walkDirectory, validateDirectory } from './files';
import {
  requestPrepareBatchUpload,
  uploadFilesWithPresignedUrls,
  finalizeUpload,
  FileInfo,
} from '@bffless/artifact-client';

/**
 * Upload PR screenshots and diff images to BFFLESS as a single deployment
 */
export async function uploadResults(
  inputs: ActionInputs,
  context: GitContext,
  report: ComparisonReport
): Promise<UploadResult> {
  const result: UploadResult = {};

  // Collect all files to upload (screenshots + diffs)
  const allFiles: FileInfo[] = [];

  // Add screenshots
  const screenshotsDir = path.resolve(inputs.path);
  const screenshotsBasePath = inputs.path.replace(/^\.\//, '').replace(/\/$/, '');

  try {
    const resolvedScreenshotsPath = validateDirectory(screenshotsDir);
    const screenshotFiles = await walkDirectory(resolvedScreenshotsPath, screenshotsBasePath);
    allFiles.push(...screenshotFiles);
    core.info(`Found ${screenshotFiles.length} screenshot files`);
  } catch {
    core.warning(`Screenshots directory not found or empty: ${screenshotsDir}`);
  }

  // Add diff images (only if there are failures)
  const hasDiffs = report.results.some((r) => r.status === 'fail' && r.diffPath);

  if (hasDiffs) {
    const diffsDir = path.resolve(inputs.outputDir);
    const diffsBasePath = inputs.outputDir.replace(/^\.\//, '').replace(/\/$/, '');

    try {
      const resolvedDiffsPath = validateDirectory(diffsDir);
      const diffFiles = await walkDirectory(resolvedDiffsPath, diffsBasePath);
      allFiles.push(...diffFiles);
      core.info(`Found ${diffFiles.length} diff files`);
    } catch {
      core.warning(`Diffs directory not found or empty: ${diffsDir}`);
    }
  }

  if (allFiles.length === 0) {
    core.warning('No files to upload');
    return result;
  }

  core.info(`Uploading ${allFiles.length} total files to alias: ${inputs.alias}`);

  try {
    // Request presigned URLs for all files
    const prepareResponse = await requestPrepareBatchUpload(inputs.apiUrl, inputs.apiKey, {
      repository: inputs.repository,
      commitSha: context.commitSha,
      branch: context.branch,
      alias: inputs.alias,
      description: buildDescription(context),
      files: allFiles.map((f) => ({
        path: f.relativePath,
        size: f.size,
        contentType: f.contentType,
      })),
    });

    // Fall back to ZIP upload when presigned URLs are not supported
    if (!prepareResponse.presignedUrlsSupported) {
      core.info('Storage does not support presigned URLs, falling back to ZIP upload');
      const response = await uploadAsZip(inputs, context, allFiles);
      result.uploadUrl = response.urls.sha || response.urls.alias;
      core.info(`Results uploaded (zip): ${result.uploadUrl}`);
      return result;
    }

    if (!prepareResponse.files || !prepareResponse.uploadToken) {
      throw new Error('Invalid response from prepare-batch-upload');
    }

    core.info(
      `Received ${prepareResponse.files.length} presigned URLs (expires: ${prepareResponse.expiresAt})`
    );

    // Create lookup map for presigned URLs
    const urlMap = new Map(prepareResponse.files.map((f) => [f.path, f.presignedUrl]));

    // Match files with presigned URLs
    const filesToUpload = allFiles.map((file) => {
      const presignedUrl = urlMap.get(file.relativePath);
      if (!presignedUrl) {
        throw new Error(`No presigned URL for file: ${file.relativePath}`);
      }
      return { file, presignedUrl };
    });

    // Upload files in parallel
    core.info('Uploading files directly to storage...');
    const uploadResults = await uploadFilesWithPresignedUrls(filesToUpload, 10, 3);

    if (uploadResults.failed.length > 0) {
      core.warning(
        `${uploadResults.failed.length} files failed to upload:\n` +
          uploadResults.failed
            .slice(0, 10)
            .map((f) => `  - ${f.path}: ${f.error}`)
            .join('\n')
      );

      if (uploadResults.failed.length > uploadResults.success.length) {
        throw new Error(`Too many upload failures: ${uploadResults.failed.length}/${allFiles.length}`);
      }
    }

    core.info(`Successfully uploaded ${uploadResults.success.length} files`);

    // Finalize upload
    const response = await finalizeUpload(inputs.apiUrl, inputs.apiKey, {
      uploadToken: prepareResponse.uploadToken,
    });

    core.info('Upload finalized successfully');
    core.info(`Deployment ID: ${response.deploymentId}`);

    result.uploadUrl = response.urls.sha || response.urls.alias;
    core.info(`Results uploaded: ${result.uploadUrl}`);
  } catch (error) {
    core.warning(
      `Failed to upload results: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return result;
}

function buildDescription(context: GitContext): string {
  const label = context.prNumber ? `PR #${context.prNumber}` : context.commitSha.slice(0, 7);
  return `Visual regression test results for ${label}`;
}

/**
 * Fallback path when the storage backend doesn't issue presigned URLs:
 * zip the collected files (preserving their relative paths as zip entry names)
 * and POST the archive to /api/deployments/zip, the same endpoint used by
 * bffless/upload-artifact in its ZIP fallback.
 */
async function uploadAsZip(
  inputs: ActionInputs,
  context: GitContext,
  allFiles: FileInfo[]
): Promise<UploadResponse> {
  const zipPath = path.join(os.tmpdir(), `vrt-upload-${Date.now()}.zip`);

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 6 } });
    output.on('close', () => resolve());
    archive.on('error', (err) => reject(err));
    archive.pipe(output);
    for (const f of allFiles) {
      archive.file(f.absolutePath, { name: f.relativePath });
    }
    archive.finalize();
  });

  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(zipPath), {
      filename: path.basename(zipPath),
      contentType: 'application/zip',
    });
    form.append('repository', inputs.repository);
    form.append('commitSha', context.commitSha);
    if (context.branch) form.append('branch', context.branch);
    form.append('alias', inputs.alias);
    form.append('description', buildDescription(context));

    const url = new URL('/api/deployments/zip', inputs.apiUrl);
    return await postFormData(url, form, inputs.apiKey);
  } finally {
    try {
      fs.unlinkSync(zipPath);
    } catch {
      /* best effort */
    }
  }
}

function postFormData(url: URL, form: FormData, apiKey: string): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;

    const req = transport.request(
      url,
      {
        method: 'POST',
        headers: {
          ...form.getHeaders(),
          'X-API-Key': apiKey,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8');
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body) as UploadResponse);
            } catch (err) {
              reject(
                new Error(
                  `Failed to parse zip upload response (HTTP ${res.statusCode}): ${body.substring(0, 200)}`
                )
              );
            }
          } else {
            reject(
              new Error(
                `ZIP upload failed: HTTP ${res.statusCode} - ${body.substring(0, 200)}`
              )
            );
          }
        });
      }
    );

    req.on('error', (err) => reject(err));
    form.pipe(req);
  });
}
