import * as core from '@actions/core';
import * as github from '@actions/github';
import { ComparisonReport, ActionInputs, GitContext, UploadResult } from './types';

/**
 * Post or update a PR comment with the visual regression report
 */
export async function postPRComment(
  report: ComparisonReport,
  inputs: ActionInputs,
  context: GitContext,
  uploadResult: UploadResult
): Promise<void> {
  // Check if we're in a PR context
  if (!context.prNumber) {
    core.info('Not in a PR context, skipping PR comment');
    return;
  }

  // Get GitHub token from environment
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    core.warning('GITHUB_TOKEN not available, skipping PR comment');
    return;
  }

  const octokit = github.getOctokit(token);
  const { summary, results } = report;

  // Determine if we should show images
  const showImages =
    inputs.summaryImages === 'true' || (inputs.summaryImages === 'auto' && report.baselineIsPublic);

  // Build the comment body
  let body = `${inputs.commentHeader}\n\n`;

  // Summary line
  const passed = summary.passed;
  const total = summary.total;
  const failed = summary.failed;
  const newScreenshots = summary.new;
  const missing = summary.missing;

  if (failed === 0 && missing === 0 && newScreenshots === 0) {
    body += `✅ **${passed}/${total}** screenshots passed\n\n`;
  } else if (failed === 0 && missing === 0 && newScreenshots > 0) {
    if (passed > 0) {
      body += `✅ **${passed}/${total - newScreenshots}** screenshots passed | ${newScreenshots} new\n\n`;
    } else {
      body += `🆕 **${newScreenshots}** new screenshots (no baseline to compare)\n\n`;
    }
  } else {
    body += `❌ **${passed}/${total - newScreenshots}** screenshots passed`;
    if (failed > 0) body += ` | ${failed} failed`;
    if (missing > 0) body += ` | ${missing} missing`;
    if (newScreenshots > 0) body += ` | ${newScreenshots} new`;
    body += '\n\n';
  }

  // Build results table
  body += '| Screenshot | Status | Diff % |\n';
  body += '|------------|--------|--------|\n';

  for (const result of results) {
    const statusEmoji =
      result.status === 'pass'
        ? '✅'
        : result.status === 'fail'
          ? '❌'
          : result.status === 'new'
            ? '🆕'
            : '⚠️';
    const diffPct =
      result.diffPercentage !== undefined ? `${result.diffPercentage.toFixed(3)}%` : '-';
    body += `| ${result.name} | ${statusEmoji} ${result.status} | ${diffPct} |\n`;
  }

  // Add collapsible sections for failures with side-by-side comparison
  const failures = results.filter((r) => r.status === 'fail');
  if (failures.length > 0) {
    body += '\n### Failed Screenshots\n\n';

    const apiUrl = inputs.apiUrl.replace(/\/$/, '');
    const [owner, repo] = context.repository.split('/');
    const screenshotsPath = inputs.path.replace(/^\.\//, '').replace(/\/$/, '');
    const diffsPath = inputs.outputDir.replace(/^\.\//, '').replace(/\/$/, '');

    if (showImages) {
      // Public: embed images directly using commit SHA URLs (stable links)
      for (const failure of failures) {
        const prodUrl = `${apiUrl}/public/${owner}/${repo}/commits/${report.baselineCommitSha}/${screenshotsPath}/${failure.name}`;
        const prUrl = `${apiUrl}/public/${owner}/${repo}/commits/${context.commitSha}/${screenshotsPath}/${failure.name}`;
        const diffUrl = `${apiUrl}/public/${owner}/${repo}/commits/${context.commitSha}/${diffsPath}/diff-${failure.name}`;

        body += `<details>\n`;
        body += `<summary>❌ ${failure.name} (${failure.diffPercentage?.toFixed(3)}% diff)</summary>\n\n`;
        body += `| Production | PR | Diff |\n`;
        body += `|------------|-----|------|\n`;
        body += `| ![prod](${prodUrl}) | ![pr](${prUrl}) | ![diff](${diffUrl}) |\n\n`;
        body += `</details>\n\n`;
      }
    } else {
      // Private: show links instead of embedded images
      body += '| Screenshot | Diff % | Links |\n';
      body += '|------------|--------|-------|\n';

      for (const failure of failures) {
        const prodUrl = `${apiUrl}/repo/${owner}/${repo}/${report.baselineCommitSha}/${screenshotsPath}/${failure.name}`;
        const prUrl = `${apiUrl}/repo/${owner}/${repo}/${context.commitSha}/${screenshotsPath}/${failure.name}`;
        const diffUrl = `${apiUrl}/repo/${owner}/${repo}/${context.commitSha}/${diffsPath}/diff-${failure.name}`;
        body += `| ${failure.name} | ${failure.diffPercentage?.toFixed(3)}% | [baseline](${prodUrl}) · [current](${prUrl}) · [diff](${diffUrl}) |\n`;
      }
      body += '\n> 🔒 Images require login to view\n';
    }
  }

  // New screenshots section
  const newResults = results.filter((r) => r.status === 'new');
  if (newResults.length > 0) {
    body += '\n### New Screenshots\n\n';
    body += 'These screenshots have no baseline to compare against:\n\n';
    for (const newImg of newResults) {
      body += `- \`${newImg.name}\`\n`;
    }
  }

  // Missing screenshots section
  const missingResults = results.filter((r) => r.status === 'missing');
  if (missingResults.length > 0) {
    body += '\n### Missing Screenshots\n\n';
    body += 'These screenshots exist in baseline but not in the current run:\n\n';
    for (const missingImg of missingResults) {
      body += `- \`${missingImg.name}\`\n`;
    }
  }

  body += '\n---\n_Generated by [BFFLESS Compare Screenshots](https://github.com/bffless/compare-screenshots)_';

  // Find existing comment by header
  const [owner, repo] = context.repository.split('/');
  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: context.prNumber,
  });

  const botComment = comments.find(
    (comment) =>
      comment.user?.type === 'Bot' && comment.body?.includes(inputs.commentHeader)
  );

  if (botComment) {
    // Update existing comment
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: botComment.id,
      body,
    });
    core.info(`Updated existing PR comment (ID: ${botComment.id})`);
  } else {
    // Create new comment
    const { data: newComment } = await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: context.prNumber,
      body,
    });
    core.info(`Created new PR comment (ID: ${newComment.id})`);
  }
}
