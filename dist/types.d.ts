export interface ActionInputs {
    path: string;
    baselineAlias: string;
    apiUrl: string;
    apiKey: string;
    threshold: number;
    pixelThreshold: number;
    includeAntiAliasing: boolean;
    uploadResults: boolean;
    alias: string;
    repository: string;
    outputDir: string;
    failOnDifference: boolean;
    summary: boolean;
    summaryImages: 'auto' | 'true' | 'false';
    comment: boolean;
    commentHeader: string;
}
export interface GitContext {
    repository: string;
    commitSha: string;
    branch: string;
    prNumber?: number;
}
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
export interface UploadResult {
    uploadUrl?: string;
}
export { UploadResponse } from '@bffless/artifact-client';
