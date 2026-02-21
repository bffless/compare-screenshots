// Action Inputs
export interface ActionInputs {
  // Required
  path: string;
  baselineAlias: string;
  apiUrl: string;
  apiKey: string;

  // Comparison
  threshold: number; // 0-100 percentage
  pixelThreshold: number; // 0-1 per-pixel
  includeAntiAliasing: boolean;

  // Upload
  uploadResults: boolean;
  alias: string;

  // Context
  repository: string;

  // Output
  outputDir: string;
  failOnDifference: boolean;
  summary: boolean;
  summaryImages: 'auto' | 'true' | 'false';

  // PR Comment
  comment: boolean;
  commentHeader: string;
}

// Git Context
export interface GitContext {
  repository: string;
  commitSha: string;
  branch: string;
  prNumber?: number;
}

// Comparison Results
export interface ComparisonResult {
  name: string;
  status: 'pass' | 'fail' | 'new' | 'missing';
  diffPixels?: number;
  totalPixels?: number;
  diffPercentage?: number;
  diffPath?: string;
  baselinePath?: string;
  currentPath?: string;
}

export interface ComparisonSummary {
  total: number;
  passed: number;
  failed: number;
  new: number;
  missing: number;
}

export interface ComparisonReport {
  timestamp: string;
  baselineAlias: string;
  baselineCommitSha: string;
  baselineIsPublic: boolean;
  currentCommitSha: string;
  threshold: number;
  results: ComparisonResult[];
  summary: ComparisonSummary;
}

export interface BaselineResult {
  commitSha: string;
  isPublic: boolean;
  outputDir: string;
  fileCount: number;
  files: string[];
}

// Action Outputs
export interface ActionOutputs {
  total: number;
  passed: number;
  failed: number;
  new: number;
  missing: number;
  result: 'pass' | 'fail' | 'error';
  report: string;
  baselineCommitSha: string;
  baselineIsPublic: boolean;
  uploadUrl?: string;
}

// Upload Result
export interface UploadResult {
  uploadUrl?: string;
}

// Re-export shared types for convenience
export { UploadResponse } from '@bffless/artifact-client';