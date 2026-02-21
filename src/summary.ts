import * as core from '@actions/core';
import { ComparisonReport, ActionInputs, GitContext, UploadResult } from './types';

/**
 * Generate GitHub step summary
 */
export async function generateSummary(
  report: ComparisonReport,
  inputs: ActionInputs,
  context: GitContext,
  uploadResult: UploadResult
): Promise<void> {
  const { summary } = report;

  // Determine if we should show images
  const showImages =
    inputs.summaryImages === 'true' || (inputs.summaryImages === 'auto' && report.baselineIsPublic);

  let md = '## Visual Regression Report\n\n';

  // Summary line
  if (summary.failed === 0 && summary.missing === 0) {
    if (summary.new > 0) {
      md += `> **${summary.new}** new screenshot${summary.new > 1 ? 's' : ''} (no baseline to compare)\n\n`;
    } else {
      md += `> **${summary.passed}/${summary.total}** screenshots passed\n\n`;
    }
  } else {
    md += `> **${summary.passed}/${summary.total - summary.new}** screenshots passed`;
    if (summary.failed > 0) md += ` | **${summary.failed}** failed`;
    if (summary.missing > 0) md += ` | **${summary.missing}** missing`;
    if (summary.new > 0) md += ` | **${summary.new}** new`;
    md += '\n\n';
  }

  // Metadata
  md += `**Baseline:** \`${inputs.baselineAlias}\` @ \`${report.baselineCommitSha.slice(0, 7)}\`\n`;
  md += `**Current:** \`${context.commitSha.slice(0, 7)}\`\n`;
  md += `**Threshold:** ${inputs.threshold}%\n\n`;

  // Results table
  md += '### Results\n\n';
  md += '| Screenshot | Status | Diff % |\n';
  md += '|------------|--------|--------|\n';

  for (const result of report.results) {
    const emoji =
      result.status === 'pass'
        ? ':white_check_mark:'
        : result.status === 'fail'
          ? ':x:'
          : result.status === 'new'
            ? ':new:'
            : ':warning:';
    const diffPct =
      result.diffPercentage !== undefined ? `${result.diffPercentage.toFixed(3)}%` : '-';
    md += `| ${result.name} | ${emoji} ${result.status} | ${diffPct} |\n`;
  }

  // Failed screenshots section with images/links
  const failures = report.results.filter((r) => r.status === 'fail');
  if (failures.length > 0) {
    md += '\n### Failed Screenshots\n\n';

    // Build URLs for images
    const apiUrl = inputs.apiUrl.replace(/\/$/, '');
    const [owner, repo] = context.repository.split('/');

    // Use the paths from inputs
    const screenshotsPath = inputs.path.replace(/^\.\//, '').replace(/\/$/, '');
    const diffsPath = inputs.outputDir.replace(/^\.\//, '').replace(/\/$/, '');

    if (showImages) {
      // Public: embed images directly
      for (const failure of failures) {
        // Build URLs to public files
        const prodUrl = `${apiUrl}/public/${owner}/${repo}/commits/${report.baselineCommitSha}/${screenshotsPath}/${failure.name}`;
        const prUrl = `${apiUrl}/public/${owner}/${repo}/commits/${context.commitSha}/${screenshotsPath}/${failure.name}`;
        const diffUrl = `${apiUrl}/public/${owner}/${repo}/commits/${context.commitSha}/${diffsPath}/diff-${failure.name}`;

        md += `<details>\n`;
        md += `<summary>:x: ${failure.name} (${failure.diffPercentage?.toFixed(3)}% diff)</summary>\n\n`;
        md += `| Production | PR | Diff |\n`;
        md += `|------------|-----|------|\n`;
        md += `| ![prod](${prodUrl}) | ![pr](${prUrl}) | ![diff](${diffUrl}) |\n\n`;
        md += `</details>\n\n`;
      }
    } else {
      // Private: link to admin section (requires login)
      const baselineUrl = `${apiUrl}/repo/${owner}/${repo}/${report.baselineCommitSha}/${screenshotsPath}`;
      const currentUrl = `${apiUrl}/repo/${owner}/${repo}/${context.commitSha}/${screenshotsPath}`;
      const diffsUrl = `${apiUrl}/repo/${owner}/${repo}/${context.commitSha}/${diffsPath}`;

      md += `| Screenshot | Diff % | Links |\n`;
      md += `|------------|--------|-------|\n`;

      for (const failure of failures) {
        md += `| ${failure.name} | ${failure.diffPercentage?.toFixed(3)}% | `;
        md += `[baseline](${baselineUrl}/${failure.name}) `;
        md += `[current](${currentUrl}/${failure.name}) `;
        md += `[diff](${diffsUrl}/diff-${failure.name}) |\n`;
      }

      md += `\n> :lock: [View all diffs](${diffsUrl}) (requires login)\n`;
    }
  }

  // New screenshots section
  const newScreenshots = report.results.filter((r) => r.status === 'new');
  if (newScreenshots.length > 0) {
    md += '\n### New Screenshots\n\n';
    md += 'These screenshots have no baseline to compare against:\n\n';
    for (const newImg of newScreenshots) {
      md += `- \`${newImg.name}\`\n`;
    }
  }

  // Missing screenshots section
  const missingScreenshots = report.results.filter((r) => r.status === 'missing');
  if (missingScreenshots.length > 0) {
    md += '\n### Missing Screenshots\n\n';
    md += 'These screenshots exist in baseline but not in the current run:\n\n';
    for (const missing of missingScreenshots) {
      md += `- \`${missing.name}\`\n`;
    }
  }

  // Upload URLs
  if (uploadResult.screenshotsUrl || uploadResult.diffsUrl) {
    md += '\n### Uploaded Results\n\n';
    if (uploadResult.screenshotsUrl) {
      md += `- [PR Screenshots](${uploadResult.screenshotsUrl})\n`;
    }
    if (uploadResult.diffsUrl) {
      md += `- [Diff Images](${uploadResult.diffsUrl})\n`;
    }
  }

  await core.summary.addRaw(md).write();
}
