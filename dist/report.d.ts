import { ComparisonReport } from './types';
/**
 * Write JSON report to file
 */
export declare function writeReport(report: ComparisonReport, reportPath: string): Promise<void>;
