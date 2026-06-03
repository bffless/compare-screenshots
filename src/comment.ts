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

  // Use GitHub's alert syntax for summary
  if (failed === 0 && missing === 0 && newScreenshots === 0) {
    body += `> [!TIP]\n> **${passed}/${total}** screenshots passed\n\n`;
  } else if (failed === 0 && missing === 0 && newScreenshots > 0) {
    if (passed > 0) {
      body += `> [!TIP]\n> **${passed}/${total - newScreenshots}** screenshots passed &nbsp;·&nbsp; **${newScreenshots}** new\n\n`;
    } else {
      body += `> [!NOTE]\n> **${newScreenshots}** new screenshot${newScreenshots > 1 ? 's' : ''} (no baseline to compare)\n\n`;
    }
  } else {
    body += `> [!WARNING]\n> **${passed}/${total - newScreenshots}** screenshots passed`;
    if (failed > 0) body += ` &nbsp;·&nbsp; **${failed}** failed`;
    if (missing > 0) body += ` &nbsp;·&nbsp; **${missing}** missing`;
    if (newScreenshots > 0) body += ` &nbsp;·&nbsp; **${newScreenshots}** new`;
    body += '\n\n';
  }

  // Metadata section
  body += '<table>\n';
  body += '<tr><td><strong>Baseline</strong></td><td><code>' + inputs.baselineAlias + '</code> @ <code>' + report.baselineCommitSha.slice(0, 7) + '</code></td></tr>\n';
  body += '<tr><td><strong>Current</strong></td><td><code>' + context.commitSha.slice(0, 7) + '</code></td></tr>\n';
  body += '<tr><td><strong>Threshold</strong></td><td>' + inputs.threshold + '%</td></tr>\n';
  body += '</table>\n\n';

  // Build results table
  body += '### Results\n\n';
  body += '| Screenshot | Status | Diff |\n';
  body += '|:-----------|:------:|-----:|\n';

  for (const result of results) {
    const statusEmoji =
      result.status === 'pass'
        ? '✅'
        : result.status === 'fail'
          ? '❌'
          : result.status === 'new'
            ? '🆕'
            : '⚠️';
    let diffCell: string;
    if (result.sizeMismatch) {
      diffCell = 'size mismatch';
    } else if (result.diffPercentage !== undefined) {
      diffCell = `${result.diffPercentage.toFixed(3)}%`;
    } else {
      diffCell = '—';
    }
    body += `| \`${result.name}\` | ${statusEmoji} | ${diffCell} |\n`;
  }

  // Add collapsible sections for failures with side-by-side comparison
  const failures = results.filter((r) => r.status === 'fail');
  if (failures.length > 0) {
    body += '\n---\n\n';
    body += '### Failed Screenshots\n\n';

    const apiUrl = inputs.apiUrl.replace(/\/$/, '');
    const [owner, repo] = context.repository.split('/');
    const screenshotsPath = inputs.path.replace(/^\.\//, '').replace(/\/$/, '');
    const diffsPath = inputs.outputDir.replace(/^\.\//, '').replace(/\/$/, '');

    for (const failure of failures) {
      const prodUrl = showImages
        ? `${apiUrl}/public/${owner}/${repo}/commits/${report.baselineCommitSha}/${screenshotsPath}/${failure.name}`
        : `${apiUrl}/repo/${owner}/${repo}/${report.baselineCommitSha}/${screenshotsPath}/${failure.name}`;
      const prUrl = showImages
        ? `${apiUrl}/public/${owner}/${repo}/commits/${context.commitSha}/${screenshotsPath}/${failure.name}`
        : `${apiUrl}/repo/${owner}/${repo}/${context.commitSha}/${screenshotsPath}/${failure.name}`;
      const diffUrl = showImages
        ? `${apiUrl}/public/${owner}/${repo}/commits/${context.commitSha}/${diffsPath}/diff-${failure.name}`
        : `${apiUrl}/repo/${owner}/${repo}/${context.commitSha}/${diffsPath}/diff-${failure.name}`;

      const sm = failure.sizeMismatch;
      const summaryText = sm
        ? `size mismatch (${sm.baselineWidth}×${sm.baselineHeight} → ${sm.currentWidth}×${sm.currentHeight})`
        : `${failure.diffPercentage?.toFixed(3)}% diff`;

      body += `<details>\n`;
      body += `<summary><strong>${failure.name}</strong> &nbsp;—&nbsp; ${summaryText}</summary>\n\n`;

      if (showImages) {
        if (sm) {
          // No diff image — pixelmatch can't compare different-sized images.
          body += `| Baseline (${sm.baselineWidth}×${sm.baselineHeight}) | Current (${sm.currentWidth}×${sm.currentHeight}) |\n`;
          body += `|:--------:|:-------:|\n`;
          body += `| <img src="${prodUrl}" width="250" /> | <img src="${prUrl}" width="250" /> |\n\n`;
        } else {
          body += `| Baseline | Current | Diff |\n`;
          body += `|:--------:|:-------:|:----:|\n`;
          body += `| <img src="${prodUrl}" width="250" /> | <img src="${prUrl}" width="250" /> | <img src="${diffUrl}" width="250" /> |\n\n`;
        }
      } else {
        body += `| | Link |\n`;
        body += `|:--|:--|\n`;
        body += `| Baseline${sm ? ` (${sm.baselineWidth}×${sm.baselineHeight})` : ''} | [View](${prodUrl}) |\n`;
        body += `| Current${sm ? ` (${sm.currentWidth}×${sm.currentHeight})` : ''} | [View](${prUrl}) |\n`;
        if (!sm) body += `| Diff | [View](${diffUrl}) |\n`;
        body += `\n`;
        body += `> 🔒 Requires login to view\n\n`;
      }

      body += `</details>\n\n`;
    }
  }

  // New screenshots section
  const newResults = results.filter((r) => r.status === 'new');
  if (newResults.length > 0) {
    body += '\n---\n\n';
    body += '### New Screenshots\n\n';
    body += '> These screenshots have no baseline to compare against:\n\n';
    for (const newImg of newResults) {
      body += `- \`${newImg.name}\`\n`;
    }
    body += '\n';
  }

  // Missing screenshots section
  const missingResults = results.filter((r) => r.status === 'missing');
  if (missingResults.length > 0) {
    body += '\n---\n\n';
    body += '### Missing Screenshots\n\n';
    body += '> These screenshots exist in baseline but not in the current run:\n\n';
    for (const missingImg of missingResults) {
      body += `- \`${missingImg.name}\`\n`;
    }
    body += '\n';
  }

  // Footer
  body += '---\n\n';
  body += '<table><tr>\n';
  body += '<td width="96"><img src="https://bffless.app/images/logo-circle.svg" width="96" height="96" /></td>\n';
  body += '<td valign="top">\n';
  body += '<strong><a href="https://bffless.app">BFFless</a></strong><br/>\n';
  body += 'The BFF your frontend deserves<br/>\n';
  body += '<a href="https://github.com/bffless/compare-screenshots">bffless/compare-screenshots</a>\n';
  body += '</td>\n';
  body += '</tr></table>';

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
