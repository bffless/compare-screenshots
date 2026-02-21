import { ComparisonReport, ActionInputs, GitContext, UploadResult } from './types';
/**
 * Generate GitHub step summary
 */
export declare function generateSummary(report: ComparisonReport, inputs: ActionInputs, context: GitContext, uploadResult: UploadResult): Promise<void>;
