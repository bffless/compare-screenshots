import * as core from '@actions/core';
import * as path from 'path';
import {
  ActionInputs,
  ComparisonReport,
  GitContext,
  UploadResult,
  UploadResponse,
  FileInfo,
} from './types';
import { walkDirectory, validateDirectory } from './files';
import { requestPrepareBatchUpload, uploadFilesWithPresignedUrls, finalizeUpload } from './api';

/**
 * Upload PR screenshots and diff images to BFFLESS
 */
export async function uploadResults(
  inputs: ActionInputs,
  context: GitContext,
  report: ComparisonReport
): Promise<UploadResult> {
  const result: UploadResult = {};

  // Determine aliases - substitute PR number if present
  const prSuffix = context.prNumber
    ? `pr-${context.prNumber}`
    : `sha-${context.commitSha.slice(0, 7)}`;

  const screenshotsAlias = inputs.screenshotsAlias || `screenshots-${prSuffix}`;
  const diffsAlias = inputs.diffsAlias || `screenshot-diffs-${prSuffix}`;

  // Upload PR screenshots (current)
  const screenshotsDir = path.resolve(inputs.path);
  const screenshotsPath = inputs.path.replace(/^\.\//, '').replace(/\/$/, '');

  try {
    core.info(`Uploading PR screenshots from: ${screenshotsDir}`);
    const screenshotsResponse = await uploadDirectory(
      screenshotsDir,
      screenshotsPath,
      screenshotsAlias,
      inputs,
      context
    );

    if (screenshotsResponse) {
      result.screenshotsUrl = screenshotsResponse.urls.sha || screenshotsResponse.urls.alias;
      core.info(`PR screenshots uploaded: ${result.screenshotsUrl}`);
    }
  } catch (error) {
    core.warning(
      `Failed to upload PR screenshots: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Upload diff images (only if there are failures)
  const hasDiffs = report.results.some((r) => r.status === 'fail' && r.diffPath);

  if (hasDiffs) {
    const diffsDir = path.resolve(inputs.outputDir);
    const diffsPath = inputs.outputDir.replace(/^\.\//, '').replace(/\/$/, '');

    try {
      core.info(`Uploading diff images from: ${diffsDir}`);
      const diffsResponse = await uploadDirectory(diffsDir, diffsPath, diffsAlias, inputs, context);

      if (diffsResponse) {
        result.diffsUrl = diffsResponse.urls.sha || diffsResponse.urls.alias;
        core.info(`Diff images uploaded: ${result.diffsUrl}`);
      }
    } catch (error) {
      core.warning(
        `Failed to upload diff images: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return result;
}

/**
 * Upload a directory to BFFLESS using presigned URLs
 */
async function uploadDirectory(
  dirPath: string,
  basePath: string,
  alias: string,
  inputs: ActionInputs,
  context: GitContext
): Promise<UploadResponse | null> {
  // Validate directory
  let resolvedPath: string;
  try {
    resolvedPath = validateDirectory(dirPath);
  } catch {
    core.warning(`Directory not found or empty: ${dirPath}`);
    return null;
  }

  // Walk directory and collect files
  const files = await walkDirectory(resolvedPath, basePath);

  if (files.length === 0) {
    core.warning(`No files found in: ${dirPath}`);
    return null;
  }

  core.info(`Found ${files.length} files to upload`);

  // Request presigned URLs
  const prepareResponse = await requestPrepareBatchUpload(inputs.apiUrl, inputs.apiKey, {
    repository: inputs.repository,
    commitSha: context.commitSha,
    branch: context.branch,
    alias,
    basePath,
    description: `Visual regression test results for ${context.prNumber ? `PR #${context.prNumber}` : context.commitSha.slice(0, 7)}`,
    files: files.map((f) => ({
      path: f.relativePath,
      size: f.size,
      contentType: f.contentType,
    })),
  });

  // Check if presigned URLs are supported
  if (!prepareResponse.presignedUrlsSupported) {
    core.warning('Storage does not support presigned URLs for upload');
    return null;
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
  const filesToUpload = files.map((file) => {
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
      throw new Error(`Too many upload failures: ${uploadResults.failed.length}/${files.length}`);
    }
  }

  core.info(`Successfully uploaded ${uploadResults.success.length} files`);

  // Finalize upload
  const response = await finalizeUpload(inputs.apiUrl, inputs.apiKey, {
    uploadToken: prepareResponse.uploadToken,
  });

  core.info('Upload finalized successfully');
  core.info(`Deployment ID: ${response.deploymentId}`);

  return response;
}
