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
  screenshotsAlias?: string;
  diffsAlias?: string;

  // Context
  repository: string;

  // Output
  outputDir: string;
  failOnDifference: boolean;
  summary: boolean;
  summaryImages: 'auto' | 'true' | 'false';
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

// Download Types (from BFFLESS API)
export interface DownloadFileInfo {
  path: string;
  size: number;
  downloadUrl: string;
}

export interface PrepareBatchDownloadRequest {
  repository: string;
  path: string;
  alias?: string;
  commitSha?: string;
  branch?: string;
}

export interface PrepareBatchDownloadResponse {
  presignedUrlsSupported: boolean;
  commitSha: string;
  isPublic: boolean;
  files: DownloadFileInfo[];
}

export interface BaselineResult {
  commitSha: string;
  isPublic: boolean;
  outputDir: string;
  fileCount: number;
  files: string[];
}

// Upload Types (from BFFLESS API)
export interface FileInfo {
  absolutePath: string;
  relativePath: string;
  size: number;
  contentType: string;
}

export interface BatchUploadFile {
  path: string;
  size: number;
  contentType: string;
}

export interface PrepareBatchUploadRequest {
  repository: string;
  commitSha: string;
  branch?: string;
  alias?: string;
  basePath?: string;
  description?: string;
  files: BatchUploadFile[];
}

export interface PresignedUrlInfo {
  path: string;
  presignedUrl: string;
  storageKey: string;
}

export interface PrepareBatchUploadResponse {
  presignedUrlsSupported: boolean;
  uploadToken?: string;
  expiresAt?: string;
  files?: PresignedUrlInfo[];
}

export interface FinalizeUploadRequest {
  uploadToken: string;
}

export interface DeploymentUrls {
  sha?: string;
  alias?: string;
  preview?: string;
  branch?: string;
}

export interface UploadResponse {
  deploymentId: string;
  repository?: string;
  commitSha: string;
  branch?: string;
  fileCount: number;
  totalSize: number;
  aliases?: string[];
  urls: DeploymentUrls;
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
  screenshotsUrl?: string;
  diffsUrl?: string;
}

// Upload Result
export interface UploadResult {
  screenshotsUrl?: string;
  diffsUrl?: string;
}
