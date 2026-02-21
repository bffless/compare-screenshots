import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('deriveContext', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should derive context from push event', async () => {
    vi.doMock('@actions/github', () => ({
      context: {
        repo: { owner: 'test-owner', repo: 'test-repo' },
        sha: 'abc123def456789012345678901234567890abcd',
        ref: 'refs/heads/main',
        eventName: 'push',
        payload: {},
      },
    }));

    const { deriveContext } = await import('../src/context');
    const context = deriveContext();

    expect(context.repository).toBe('test-owner/test-repo');
    expect(context.commitSha).toBe('abc123def456789012345678901234567890abcd');
    expect(context.branch).toBe('main');
    expect(context.prNumber).toBeUndefined();
  });

  it('should derive context from pull_request event', async () => {
    vi.doMock('@actions/github', () => ({
      context: {
        repo: { owner: 'test-owner', repo: 'test-repo' },
        sha: 'merge-commit-sha',
        ref: 'refs/pull/123/merge',
        eventName: 'pull_request',
        payload: {
          pull_request: {
            number: 123,
            head: {
              sha: 'pr-head-sha-12345678901234567890123456789012',
              ref: 'feature-branch',
            },
          },
        },
      },
    }));

    const { deriveContext } = await import('../src/context');
    const context = deriveContext();

    expect(context.repository).toBe('test-owner/test-repo');
    expect(context.commitSha).toBe('pr-head-sha-12345678901234567890123456789012');
    expect(context.branch).toBe('feature-branch');
    expect(context.prNumber).toBe(123);
  });

  it('should strip refs/heads/ from branch name', async () => {
    vi.doMock('@actions/github', () => ({
      context: {
        repo: { owner: 'owner', repo: 'repo' },
        sha: 'sha123',
        ref: 'refs/heads/feature/my-feature',
        eventName: 'push',
        payload: {},
      },
    }));

    const { deriveContext } = await import('../src/context');
    const context = deriveContext();

    expect(context.branch).toBe('feature/my-feature');
  });
});
