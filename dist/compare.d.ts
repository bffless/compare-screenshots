import { ActionInputs, ComparisonReport, BaselineResult, GitContext } from './types';
/**
 * Compare local screenshots against baseline
 */
export declare function compareScreenshots(inputs: ActionInputs, baseline: BaselineResult, context: GitContext): Promise<ComparisonReport>;
