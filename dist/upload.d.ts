import { ActionInputs, ComparisonReport, GitContext, UploadResult } from './types';
/**
 * Upload PR screenshots and diff images to BFFLESS as a single deployment
 */
export declare function uploadResults(inputs: ActionInputs, context: GitContext, report: ComparisonReport): Promise<UploadResult>;
