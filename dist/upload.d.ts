import { ActionInputs, ComparisonReport, GitContext, UploadResult } from './types';
/**
 * Upload PR screenshots and diff images to BFFLESS
 */
export declare function uploadResults(inputs: ActionInputs, context: GitContext, report: ComparisonReport): Promise<UploadResult>;
