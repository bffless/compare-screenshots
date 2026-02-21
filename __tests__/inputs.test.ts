import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @actions/core before importing inputs
vi.mock('@actions/core', () => ({
  getInput: vi.fn(),
  setSecret: vi.fn(),
}));

// Mock @actions/github
vi.mock('@actions/github', () => ({
  context: {
    repo: { owner: 'test-owner', repo: 'test-repo' },
    sha: 'abc123def456',
    ref: 'refs/heads/main',
    eventName: 'push',
    payload: {},
  },
}));

import * as core from '@actions/core';
import { getInputs } from '../src/inputs';

describe('getInputs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should parse required inputs correctly', () => {
    const mockGetInput = vi.mocked(core.getInput);
    mockGetInput.mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        path: './screenshots',
        'baseline-alias': 'screenshots-production',
        'api-url': 'https://api.example.com',
        'api-key': 'secret-key',
      };
      return inputs[name] || '';
    });

    const inputs = getInputs();

    expect(inputs.path).toBe('./screenshots');
    expect(inputs.baselineAlias).toBe('screenshots-production');
    expect(inputs.apiUrl).toBe('https://api.example.com');
    expect(inputs.apiKey).toBe('secret-key');
    expect(core.setSecret).toHaveBeenCalledWith('secret-key');
  });

  it('should use default values for optional inputs', () => {
    const mockGetInput = vi.mocked(core.getInput);
    mockGetInput.mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        path: './screenshots',
        'baseline-alias': 'production',
        'api-url': 'https://api.example.com',
        'api-key': 'secret',
      };
      return inputs[name] || '';
    });

    const inputs = getInputs();

    expect(inputs.threshold).toBe(0.1);
    expect(inputs.pixelThreshold).toBe(0.1);
    expect(inputs.includeAntiAliasing).toBe(false);
    expect(inputs.uploadResults).toBe(true);
    expect(inputs.outputDir).toBe('./screenshot-diffs');
    expect(inputs.failOnDifference).toBe(true);
    expect(inputs.summary).toBe(true);
    expect(inputs.summaryImages).toBe('auto');
  });

  it('should parse custom threshold values', () => {
    const mockGetInput = vi.mocked(core.getInput);
    mockGetInput.mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        path: './screenshots',
        'baseline-alias': 'production',
        'api-url': 'https://api.example.com',
        'api-key': 'secret',
        threshold: '0.5',
        'pixel-threshold': '0.2',
      };
      return inputs[name] || '';
    });

    const inputs = getInputs();

    expect(inputs.threshold).toBe(0.5);
    expect(inputs.pixelThreshold).toBe(0.2);
  });

  it('should throw error for invalid threshold', () => {
    const mockGetInput = vi.mocked(core.getInput);
    mockGetInput.mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        path: './screenshots',
        'baseline-alias': 'production',
        'api-url': 'https://api.example.com',
        'api-key': 'secret',
        threshold: '150', // Invalid: > 100
      };
      return inputs[name] || '';
    });

    expect(() => getInputs()).toThrow('Invalid threshold');
  });

  it('should throw error for invalid pixel threshold', () => {
    const mockGetInput = vi.mocked(core.getInput);
    mockGetInput.mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        path: './screenshots',
        'baseline-alias': 'production',
        'api-url': 'https://api.example.com',
        'api-key': 'secret',
        'pixel-threshold': '2.0', // Invalid: > 1
      };
      return inputs[name] || '';
    });

    expect(() => getInputs()).toThrow('Invalid pixel-threshold');
  });

  it('should parse boolean inputs correctly', () => {
    const mockGetInput = vi.mocked(core.getInput);
    mockGetInput.mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        path: './screenshots',
        'baseline-alias': 'production',
        'api-url': 'https://api.example.com',
        'api-key': 'secret',
        'include-anti-aliasing': 'true',
        'upload-results': 'false',
        'fail-on-difference': 'false',
        summary: 'false',
      };
      return inputs[name] || '';
    });

    const inputs = getInputs();

    expect(inputs.includeAntiAliasing).toBe(true);
    expect(inputs.uploadResults).toBe(false);
    expect(inputs.failOnDifference).toBe(false);
    expect(inputs.summary).toBe(false);
  });

  it('should parse summary-images values', () => {
    const testCases = [
      { input: 'auto', expected: 'auto' },
      { input: 'true', expected: 'true' },
      { input: 'false', expected: 'false' },
      { input: '', expected: 'auto' },
      { input: 'invalid', expected: 'auto' }, // Falls through to default
    ];

    for (const testCase of testCases) {
      const mockGetInput = vi.mocked(core.getInput);
      mockGetInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          path: './screenshots',
          'baseline-alias': 'production',
          'api-url': 'https://api.example.com',
          'api-key': 'secret',
          'summary-images': testCase.input,
        };
        return inputs[name] || '';
      });

      const inputs = getInputs();
      expect(inputs.summaryImages).toBe(testCase.expected);
    }
  });

  it('should derive repository from context', () => {
    const mockGetInput = vi.mocked(core.getInput);
    mockGetInput.mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        path: './screenshots',
        'baseline-alias': 'production',
        'api-url': 'https://api.example.com',
        'api-key': 'secret',
      };
      return inputs[name] || '';
    });

    const inputs = getInputs();

    expect(inputs.repository).toBe('test-owner/test-repo');
  });
});
