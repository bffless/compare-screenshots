import * as core from '@actions/core';
import { ActionInputs } from './types';
import { deriveContext } from './context';

export function getInputs(): ActionInputs {
  // Required inputs
  const path = core.getInput('path', { required: true });
  const baselineAlias = core.getInput('baseline-alias', { required: true });
  const apiUrl = core.getInput('api-url', { required: true });
  const apiKey = core.getInput('api-key', { required: true });
  core.setSecret(apiKey);

  // Comparison options
  const thresholdInput = core.getInput('threshold') || '0.1';
  const threshold = parseFloat(thresholdInput);
  if (isNaN(threshold) || threshold < 0 || threshold > 100) {
    throw new Error(`Invalid threshold: ${thresholdInput}. Must be a number between 0 and 100.`);
  }

  const pixelThresholdInput = core.getInput('pixel-threshold') || '0.1';
  const pixelThreshold = parseFloat(pixelThresholdInput);
  if (isNaN(pixelThreshold) || pixelThreshold < 0 || pixelThreshold > 1) {
    throw new Error(
      `Invalid pixel-threshold: ${pixelThresholdInput}. Must be a number between 0 and 1.`
    );
  }

  const includeAntiAliasingInput = core.getInput('include-anti-aliasing') || 'false';
  const includeAntiAliasing = includeAntiAliasingInput.toLowerCase() === 'true';

  // Upload options
  const uploadResultsInput = core.getInput('upload-results') || 'true';
  const uploadResults = uploadResultsInput.toLowerCase() !== 'false';
  const screenshotsAlias = core.getInput('screenshots-alias') || undefined;
  const diffsAlias = core.getInput('diffs-alias') || undefined;

  // Repository context
  const context = deriveContext();
  const repository = core.getInput('repository') || context.repository;

  // Output options
  const outputDir = core.getInput('output-dir') || './screenshot-diffs';

  const failOnDifferenceInput = core.getInput('fail-on-difference') || 'true';
  const failOnDifference = failOnDifferenceInput.toLowerCase() !== 'false';

  const summaryInput = core.getInput('summary') || 'true';
  const summary = summaryInput.toLowerCase() !== 'false';

  const summaryImagesInput = core.getInput('summary-images') || 'auto';
  let summaryImages: 'auto' | 'true' | 'false' = 'auto';
  if (summaryImagesInput === 'true') {
    summaryImages = 'true';
  } else if (summaryImagesInput === 'false') {
    summaryImages = 'false';
  }

  return {
    path,
    baselineAlias,
    apiUrl,
    apiKey,
    threshold,
    pixelThreshold,
    includeAntiAliasing,
    uploadResults,
    screenshotsAlias,
    diffsAlias,
    repository,
    outputDir,
    failOnDifference,
    summary,
    summaryImages,
  };
}
