import * as core from '@actions/core';
import * as path from 'path';
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
  const allFiles: Array<{ absolutePath: string; relativePath: string; size: number; contentType: string }> = [];

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
      description: `Visual regression test results for ${context.prNumber ? `PR #${context.prNumber}` : context.commitSha.slice(0, 7)}`,
      files: allFiles.map((f) => ({
        path: f.relativePath,
        size: f.size,
        contentType: f.contentType,
      })),
    });

    // Check if presigned URLs are supported
    if (!prepareResponse.presignedUrlsSupported) {
      core.warning('Storage does not support presigned URLs for upload');
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
