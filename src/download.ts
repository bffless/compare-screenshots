import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ActionInputs, BaselineResult, GitContext } from './types';
import {
  requestPrepareBatchDownload,
  downloadFilesWithPresignedUrls,
  downloadFilesDirect,
} from './api';

/**
 * Download baseline screenshots from BFFLESS
 */
export async function downloadBaseline(
  inputs: ActionInputs,
  context: GitContext
): Promise<BaselineResult> {
  // Create temp directory for baseline
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrt-baseline-'));

  core.info(`Downloading baseline to: ${tempDir}`);

  // Request download manifest
  // The baseline-alias refers to a specific path in BFFLESS
  // We need to extract just the filename portion for the local path
  const baselinePath = inputs.path.replace(/^\.\//, '').replace(/\/$/, '');

  const prepareResponse = await requestPrepareBatchDownload(inputs.apiUrl, inputs.apiKey, {
    repository: inputs.repository,
    path: baselinePath,
    alias: inputs.baselineAlias,
  });

  if (prepareResponse.files.length === 0) {
    core.warning('No baseline files found');
    return {
      commitSha: prepareResponse.commitSha,
      isPublic: prepareResponse.isPublic ?? false,
      outputDir: tempDir,
      fileCount: 0,
      files: [],
    };
  }

  core.info(`Found ${prepareResponse.files.length} baseline files`);
  core.info(`Baseline commit SHA: ${prepareResponse.commitSha}`);
  core.info(`Baseline is public: ${prepareResponse.isPublic ?? false}`);

  let downloadResults: { success: string[]; failed: Array<{ path: string; error: string }> };

  if (prepareResponse.presignedUrlsSupported) {
    // Download using presigned URLs (direct from storage)
    core.info('Downloading baseline directly from storage...');
    downloadResults = await downloadFilesWithPresignedUrls(prepareResponse.files, tempDir, 10, 3);
  } else {
    // Fallback to direct download through API
    core.info('Storage does not support presigned URLs, downloading through API...');
    downloadResults = await downloadFilesDirect(
      inputs.apiUrl,
      inputs.apiKey,
      prepareResponse.files,
      tempDir,
      {
        repository: inputs.repository,
        alias: inputs.baselineAlias,
      },
      10,
      3
    );
  }

  if (downloadResults.failed.length > 0) {
    core.warning(
      `${downloadResults.failed.length} baseline files failed to download:\n` +
        downloadResults.failed
          .slice(0, 10)
          .map((f) => `  - ${f.path}: ${f.error}`)
          .join('\n')
    );

    if (downloadResults.failed.length > downloadResults.success.length) {
      throw new Error(
        `Too many download failures: ${downloadResults.failed.length}/${prepareResponse.files.length}`
      );
    }
  }

  core.info(`Successfully downloaded ${downloadResults.success.length} baseline files`);

  return {
    commitSha: prepareResponse.commitSha,
    isPublic: prepareResponse.isPublic ?? false,
    outputDir: tempDir,
    fileCount: downloadResults.success.length,
    files: downloadResults.success,
  };
}
