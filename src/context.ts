import * as github from '@actions/github';
import { GitContext } from './types';

export function deriveContext(): GitContext {
  const { context } = github;
  const repository = context.repo.owner + '/' + context.repo.repo;

  let commitSha: string;
  let branch: string;
  let prNumber: number | undefined;

  if (context.eventName === 'pull_request' && context.payload.pull_request) {
    commitSha = context.payload.pull_request.head.sha;
    branch = context.payload.pull_request.head.ref;
    prNumber = context.payload.pull_request.number;
  } else {
    commitSha = context.sha;
    branch = context.ref.replace('refs/heads/', '');
  }

  return { repository, commitSha, branch, prNumber };
}
