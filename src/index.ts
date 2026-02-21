import * as core from '@actions/core';
import * as fs from 'fs';
import { getInputs } from './inputs';
import { deriveContext } from './context';
import { downloadBaseline } from './download';
import { compareScreenshots } from './compare';
import { uploadResults } from './upload';
import { generateSummary } from './summary';
import { postPRComment } from './comment';
import { writeReport } from './report';
import { ActionOutputs, UploadResult } from './types';

async function run(): Promise<void> {
  let baselineDir: string | undefined;

  try {
    // 1. Parse and validate inputs
    const inputs = getInputs();
    core.setSecret(inputs.apiKey);

    core.info(`Path: ${inputs.path}`);
    core.info(`Baseline alias: ${inputs.baselineAlias}`);
    core.info(`API URL: ${inputs.apiUrl}`);
    core.info(`Repository: ${inputs.repository}`);
    core.info(`Threshold: ${inputs.threshold}%`);
    core.info(`Upload results: ${inputs.uploadResults}`);

    // 2. Get git context
    const context = deriveContext();
    core.info(`Commit SHA: ${context.commitSha}`);
    core.info(`Branch: ${context.branch}`);
    if (context.prNumber) core.info(`PR Number: ${context.prNumber}`);

    // 3. Download baseline screenshots from BFFLESS
    core.info(`\nDownloading baseline from alias: ${inputs.baselineAlias}`);
    const baseline = await downloadBaseline(inputs, context);
    baselineDir = baseline.outputDir;
    core.info(`Downloaded ${baseline.fileCount} baseline screenshots`);
    core.info(`Baseline commit SHA: ${baseline.commitSha}`);
    core.info(`Baseline is public: ${baseline.isPublic}`);

    // 4. Compare screenshots
    core.info(`\nComparing screenshots from: ${inputs.path}`);
    const report = await compareScreenshots(inputs, baseline, context);

    // Log comparison results
    core.info(`\nComparison Results:`);
    core.info(`  Total: ${report.summary.total}`);
    core.info(`  Passed: ${report.summary.passed}`);
    core.info(`  Failed: ${report.summary.failed}`);
    core.info(`  New: ${report.summary.new}`);
    core.info(`  Missing: ${report.summary.missing}`);

    // 5. Write JSON report
    const reportPath = './vrt-report.json';
    await writeReport(report, reportPath);
    core.info(`\nReport written to: ${reportPath}`);

    // 6. Upload results if enabled and there are failures/new screenshots
    let uploadedUrls: UploadResult = {};
    if (inputs.uploadResults && (report.summary.failed > 0 || report.summary.new > 0)) {
      core.info('\nUploading results to BFFLESS...');
      uploadedUrls = await uploadResults(inputs, context, report);
    }

    // 7. Set outputs
    const outputs: ActionOutputs = {
      total: report.summary.total,
      passed: report.summary.passed,
      failed: report.summary.failed,
      new: report.summary.new,
      missing: report.summary.missing,
      result: report.summary.failed > 0 || report.summary.missing > 0 ? 'fail' : 'pass',
      report: JSON.stringify(report),
      baselineCommitSha: baseline.commitSha,
      baselineIsPublic: baseline.isPublic,
      ...uploadedUrls,
    };

    core.setOutput('total', outputs.total);
    core.setOutput('passed', outputs.passed);
    core.setOutput('failed', outputs.failed);
    core.setOutput('new', outputs.new);
    core.setOutput('missing', outputs.missing);
    core.setOutput('result', outputs.result);
    core.setOutput('report', outputs.report);
    core.setOutput('baseline-commit-sha', outputs.baselineCommitSha);
    core.setOutput('baseline-is-public', outputs.baselineIsPublic);
    if (outputs.uploadUrl) core.setOutput('upload-url', outputs.uploadUrl);

    // 8. Generate summary
    if (inputs.summary) {
      await generateSummary(report, inputs, context, uploadedUrls);
    }

    // 9. Post PR comment
    if (inputs.comment) {
      await postPRComment(report, inputs, context, uploadedUrls);
    }

    // 10. Fail if differences detected and configured to fail
    if (inputs.failOnDifference && outputs.result === 'fail') {
      core.setFailed(
        `Visual regression detected: ${report.summary.failed} failed, ${report.summary.missing} missing`
      );
    }

    // Force exit to close any dangling HTTP connections
    process.exit(outputs.result === 'fail' && inputs.failOnDifference ? 1 : 0);
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    // Clean up temp baseline directory
    if (baselineDir && fs.existsSync(baselineDir)) {
      try {
        fs.rmSync(baselineDir, { recursive: true });
        core.info('Cleaned up temporary baseline directory');
      } catch {
        core.warning(`Failed to clean up temp directory: ${baselineDir}`);
      }
    }
  }
}

run();
