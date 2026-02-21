import { ComparisonReport, ActionInputs, GitContext, UploadResult } from './types';
/**
 * Post or update a PR comment with the visual regression report
 */
export declare function postPRComment(report: ComparisonReport, inputs: ActionInputs, context: GitContext, uploadResult: UploadResult): Promise<void>;
