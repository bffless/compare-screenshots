import * as fs from 'fs';
import * as path from 'path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import {
  ActionInputs,
  ComparisonResult,
  ComparisonReport,
  BaselineResult,
  GitContext,
} from './types';

/**
 * Compare local screenshots against baseline
 */
export async function compareScreenshots(
  inputs: ActionInputs,
  baseline: BaselineResult,
  context: GitContext
): Promise<ComparisonReport> {
  const results: ComparisonResult[] = [];

  // Get local screenshots
  const localDir = path.resolve(inputs.path);
  const localScreenshots = new Set(getScreenshots(localDir));

  // Get baseline screenshots - they're stored with their relative paths
  // e.g., "screenshots/home.png" -> we want just "home.png"
  // When baseline-path is set, only consider files under that subpath, so
  // unrelated PNGs elsewhere in the alias don't pollute the baseline set.
  const baselinePrefix = inputs.baselinePath
    ? inputs.baselinePath.replace(/^\.?\/+/, '').replace(/\/+$/, '') + '/'
    : undefined;
  const baselineScreenshots = new Map<string, string>();
  for (const file of baseline.files) {
    const normalized = file.replace(/\\/g, '/');
    if (baselinePrefix && !normalized.startsWith(baselinePrefix)) continue;
    if (!normalized.toLowerCase().endsWith('.png')) continue;
    const filename = path.basename(file);
    baselineScreenshots.set(filename, path.join(baseline.outputDir, file));
  }

  // Ensure output directory exists
  const outputDir = path.resolve(inputs.outputDir);
  fs.mkdirSync(outputDir, { recursive: true });

  // Combine all screenshots
  const allScreenshots = new Set([...localScreenshots, ...baselineScreenshots.keys()]);

  for (const screenshot of allScreenshots) {
    const localPath = path.join(localDir, screenshot);
    const baselinePath = baselineScreenshots.get(screenshot);

    const inLocal = localScreenshots.has(screenshot);
    const inBaseline = baselineScreenshots.has(screenshot);

    if (inLocal && !inBaseline) {
      // New screenshot
      results.push({
        name: screenshot,
        status: 'new',
        currentPath: localPath,
      });
    } else if (!inLocal && inBaseline) {
      // Missing screenshot
      results.push({
        name: screenshot,
        status: 'missing',
        baselinePath,
      });
    } else if (baselinePath) {
      // Compare
      const diffPath = path.join(outputDir, `diff-${screenshot}`);
      const comparison = compareImages(baselinePath, localPath, diffPath, inputs);

      const passed =
        !comparison.sizeMismatch &&
        comparison.diffPercentage !== undefined &&
        comparison.diffPercentage <= inputs.threshold;

      results.push({
        name: screenshot,
        status: passed ? 'pass' : 'fail',
        ...comparison,
        baselinePath,
        currentPath: localPath,
        diffPath:
          comparison.diffPercentage !== undefined && comparison.diffPercentage > 0
            ? diffPath
            : undefined,
      });
    }
  }

  // Generate summary
  const summary = {
    total: results.length,
    passed: results.filter((r) => r.status === 'pass').length,
    failed: results.filter((r) => r.status === 'fail').length,
    new: results.filter((r) => r.status === 'new').length,
    missing: results.filter((r) => r.status === 'missing').length,
  };

  return {
    timestamp: new Date().toISOString(),
    baselineAlias: inputs.baselineAlias,
    baselineCommitSha: baseline.commitSha,
    baselineIsPublic: baseline.isPublic,
    currentCommitSha: context.commitSha,
    threshold: inputs.threshold,
    results,
    summary,
  };
}

/**
 * Compare two images and generate a diff
 */
function compareImages(
  baselinePath: string,
  currentPath: string,
  diffPath: string,
  inputs: ActionInputs
): {
  diffPixels?: number;
  totalPixels?: number;
  diffPercentage?: number;
  sizeMismatch?: ComparisonResult['sizeMismatch'];
} {
  const baseline = PNG.sync.read(fs.readFileSync(baselinePath));
  const current = PNG.sync.read(fs.readFileSync(currentPath));

  // pixelmatch requires identical dimensions. Rather than synthesise a
  // misleading diff image (the old behavior filled the whole canvas with
  // magenta and reported 100%), surface the dimensions so the report can
  // explain the failure honestly.
  if (baseline.width !== current.width || baseline.height !== current.height) {
    return {
      sizeMismatch: {
        baselineWidth: baseline.width,
        baselineHeight: baseline.height,
        currentWidth: current.width,
        currentHeight: current.height,
      },
    };
  }

  const { width, height } = baseline;
  const diff = new PNG({ width, height });
  const totalPixels = width * height;

  const diffPixels = pixelmatch(baseline.data, current.data, diff.data, width, height, {
    threshold: inputs.pixelThreshold,
    includeAA: inputs.includeAntiAliasing,
  });

  const diffPercentage = (diffPixels / totalPixels) * 100;

  // Write diff image if there are differences
  if (diffPixels > 0) {
    fs.writeFileSync(diffPath, PNG.sync.write(diff));
  }

  return { diffPixels, totalPixels, diffPercentage };
}

/**
 * Get list of PNG screenshots in a directory
 */
function getScreenshots(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir);
  return files.filter((f) => f.endsWith('.png') && !f.startsWith('.'));
}
