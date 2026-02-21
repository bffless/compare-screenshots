import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PNG } from 'pngjs';

// Mock dependencies
vi.mock('@actions/core', () => ({
  info: vi.fn(),
  warning: vi.fn(),
  setFailed: vi.fn(),
}));

import { compareScreenshots } from '../src/compare';
import { ActionInputs, BaselineResult, GitContext } from '../src/types';

describe('compareScreenshots', () => {
  let tempDir: string;
  let baselineDir: string;
  let currentDir: string;
  let outputDir: string;

  // Helper to create a solid color PNG
  function createSolidPng(width: number, height: number, r: number, g: number, b: number): Buffer {
    const png = new PNG({ width, height });
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (width * y + x) * 4;
        png.data[idx] = r;
        png.data[idx + 1] = g;
        png.data[idx + 2] = b;
        png.data[idx + 3] = 255;
      }
    }
    return PNG.sync.write(png);
  }

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrt-test-'));
    baselineDir = path.join(tempDir, 'baseline');
    currentDir = path.join(tempDir, 'current');
    outputDir = path.join(tempDir, 'diffs');

    fs.mkdirSync(baselineDir, { recursive: true });
    fs.mkdirSync(currentDir, { recursive: true });
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  const createInputs = (overrides: Partial<ActionInputs> = {}): ActionInputs => ({
    path: currentDir,
    baselineAlias: 'production',
    apiUrl: 'https://api.example.com',
    apiKey: 'secret',
    threshold: 0.1,
    pixelThreshold: 0.1,
    includeAntiAliasing: false,
    uploadResults: true,
    repository: 'owner/repo',
    outputDir,
    failOnDifference: true,
    summary: true,
    summaryImages: 'auto',
    ...overrides,
  });

  const createBaseline = (files: string[] = []): BaselineResult => ({
    commitSha: 'abc123',
    isPublic: true,
    outputDir: baselineDir,
    fileCount: files.length,
    files,
  });

  const createContext = (): GitContext => ({
    repository: 'owner/repo',
    commitSha: 'def456',
    branch: 'main',
    prNumber: 123,
  });

  it('should report pass when images are identical', async () => {
    // Create identical images
    const redPng = createSolidPng(100, 100, 255, 0, 0);
    fs.writeFileSync(path.join(baselineDir, 'test.png'), redPng);
    fs.writeFileSync(path.join(currentDir, 'test.png'), redPng);

    const inputs = createInputs();
    const baseline = createBaseline(['test.png']);
    const context = createContext();

    const report = await compareScreenshots(inputs, baseline, context);

    expect(report.summary.total).toBe(1);
    expect(report.summary.passed).toBe(1);
    expect(report.summary.failed).toBe(0);
    expect(report.results[0].status).toBe('pass');
    expect(report.results[0].diffPercentage).toBe(0);
  });

  it('should report fail when images are different', async () => {
    // Create different images
    const redPng = createSolidPng(100, 100, 255, 0, 0);
    const bluePng = createSolidPng(100, 100, 0, 0, 255);
    fs.writeFileSync(path.join(baselineDir, 'test.png'), redPng);
    fs.writeFileSync(path.join(currentDir, 'test.png'), bluePng);

    const inputs = createInputs();
    const baseline = createBaseline(['test.png']);
    const context = createContext();

    const report = await compareScreenshots(inputs, baseline, context);

    expect(report.summary.total).toBe(1);
    expect(report.summary.passed).toBe(0);
    expect(report.summary.failed).toBe(1);
    expect(report.results[0].status).toBe('fail');
    expect(report.results[0].diffPercentage).toBeGreaterThan(0);
    // Should create a diff file
    expect(fs.existsSync(path.join(outputDir, 'diff-test.png'))).toBe(true);
  });

  it('should report new screenshots not in baseline', async () => {
    // Create only a current screenshot
    const redPng = createSolidPng(100, 100, 255, 0, 0);
    fs.writeFileSync(path.join(currentDir, 'new-screen.png'), redPng);

    const inputs = createInputs();
    const baseline = createBaseline([]); // No baseline files
    const context = createContext();

    const report = await compareScreenshots(inputs, baseline, context);

    expect(report.summary.total).toBe(1);
    expect(report.summary.new).toBe(1);
    expect(report.results[0].status).toBe('new');
    expect(report.results[0].name).toBe('new-screen.png');
  });

  it('should report missing screenshots in baseline but not current', async () => {
    // Create only a baseline screenshot
    const redPng = createSolidPng(100, 100, 255, 0, 0);
    fs.writeFileSync(path.join(baselineDir, 'missing.png'), redPng);

    const inputs = createInputs();
    const baseline = createBaseline(['missing.png']);
    const context = createContext();

    const report = await compareScreenshots(inputs, baseline, context);

    expect(report.summary.total).toBe(1);
    expect(report.summary.missing).toBe(1);
    expect(report.results[0].status).toBe('missing');
    expect(report.results[0].name).toBe('missing.png');
  });

  it('should handle size mismatch as 100% diff', async () => {
    // Create images with different sizes
    const small = createSolidPng(50, 50, 255, 0, 0);
    const large = createSolidPng(100, 100, 255, 0, 0);
    fs.writeFileSync(path.join(baselineDir, 'size-diff.png'), small);
    fs.writeFileSync(path.join(currentDir, 'size-diff.png'), large);

    const inputs = createInputs();
    const baseline = createBaseline(['size-diff.png']);
    const context = createContext();

    const report = await compareScreenshots(inputs, baseline, context);

    expect(report.summary.failed).toBe(1);
    expect(report.results[0].status).toBe('fail');
    expect(report.results[0].diffPercentage).toBe(100);
  });

  it('should respect threshold for passing', async () => {
    // Create images with small difference (change a few pixels)
    const png1 = createSolidPng(100, 100, 255, 0, 0);
    const png2 = createSolidPng(100, 100, 255, 0, 0);

    // Modify a single pixel in png2
    const parsed2 = PNG.sync.read(png2);
    parsed2.data[0] = 0; // Change first pixel's red to 0
    const modified2 = PNG.sync.write(parsed2);

    fs.writeFileSync(path.join(baselineDir, 'test.png'), png1);
    fs.writeFileSync(path.join(currentDir, 'test.png'), modified2);

    // With high threshold, should pass
    const inputs = createInputs({ threshold: 1 }); // 1% threshold
    const baseline = createBaseline(['test.png']);
    const context = createContext();

    const report = await compareScreenshots(inputs, baseline, context);

    // 1 pixel out of 10000 is 0.01%, should pass with 1% threshold
    expect(report.results[0].status).toBe('pass');
  });

  it('should include metadata in report', async () => {
    const redPng = createSolidPng(100, 100, 255, 0, 0);
    fs.writeFileSync(path.join(baselineDir, 'test.png'), redPng);
    fs.writeFileSync(path.join(currentDir, 'test.png'), redPng);

    const inputs = createInputs({ threshold: 0.5 });
    const baseline = createBaseline(['test.png']);
    baseline.commitSha = 'baseline-sha-123';
    baseline.isPublic = false;
    const context = createContext();

    const report = await compareScreenshots(inputs, baseline, context);

    expect(report.baselineAlias).toBe('production');
    expect(report.baselineCommitSha).toBe('baseline-sha-123');
    expect(report.baselineIsPublic).toBe(false);
    expect(report.currentCommitSha).toBe('def456');
    expect(report.threshold).toBe(0.5);
    expect(report.timestamp).toBeDefined();
  });

  it('should handle multiple screenshots', async () => {
    const redPng = createSolidPng(100, 100, 255, 0, 0);
    const bluePng = createSolidPng(100, 100, 0, 0, 255);
    const greenPng = createSolidPng(100, 100, 0, 255, 0);

    // Identical
    fs.writeFileSync(path.join(baselineDir, 'same.png'), redPng);
    fs.writeFileSync(path.join(currentDir, 'same.png'), redPng);

    // Different
    fs.writeFileSync(path.join(baselineDir, 'diff.png'), redPng);
    fs.writeFileSync(path.join(currentDir, 'diff.png'), bluePng);

    // New
    fs.writeFileSync(path.join(currentDir, 'new.png'), greenPng);

    // Missing
    fs.writeFileSync(path.join(baselineDir, 'missing.png'), greenPng);

    const inputs = createInputs();
    const baseline = createBaseline(['same.png', 'diff.png', 'missing.png']);
    const context = createContext();

    const report = await compareScreenshots(inputs, baseline, context);

    expect(report.summary.total).toBe(4);
    expect(report.summary.passed).toBe(1);
    expect(report.summary.failed).toBe(1);
    expect(report.summary.new).toBe(1);
    expect(report.summary.missing).toBe(1);
  });
});
