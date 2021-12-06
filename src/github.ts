import { Change } from '@aws-sdk/client-cloudformation';
import github from '@actions/github';
import { markdownTable } from 'markdown-table';

function getChangeSetTable(changes: Change[]): string {
  if (!changes.length) {
    return '';
  }
  const headings = [
    ['', 'ResourceType', 'LogicalResourceId', 'Action', 'Replacement'],
  ];
  const rows: [string, string, string, string, string][] = changes.map(
    (change) => [
      '✅',
      String(change.ResourceChange?.ResourceType),
      String(change.ResourceChange?.LogicalResourceId),
      String(change.ResourceChange?.Action),
      String(change.ResourceChange?.Replacement),
    ]
  );
  return markdownTable(headings.concat(rows), {
    align: ['l', 'l', 'l', 'l', 'l'],
  });
}

function getStackChangesMessage(
  changes: Change[],
  changeSetTable: string,
  createStack: boolean
): string {
  if (!createStack) {
    return '';
  }
  return `${
    changes.length
      ? `
  The following Stack changes have been applied:

  ${changeSetTable}
  `
      : `
  (No Stack changes)
`
  }`;
}

function getCommentMarkdown(
  changes: Change[],
  changeSetTable: string,
  previewUrlHost: string,
  prBranchName: string,
  createStack: boolean
): string {
  const previewUrl = `https://${prBranchName}.${previewUrlHost}`;
  return `${getStackChangesMessage(changes, changeSetTable, createStack)}
  🎉 Preview site deployed to: [${previewUrl}](${previewUrl})
    `;
}

export function generateCommentId(issue: typeof github.context.issue): string {
  return `AWS Stack Change (ID:${issue.number})`;
}

export async function deletePRComment(token: string): Promise<void> {
  const issue = github.context.issue;
  const commentId = generateCommentId(issue);
  const octokit = github.getOctokit(token);

  const comments = await octokit.rest.issues.listComments({
    issue_number: issue.number,
    owner: issue.owner,
    repo: issue.repo,
  });

  const existingComment = comments.data.find((comment) =>
    comment.body?.startsWith(commentId)
  );

  if (existingComment) {
    await octokit.rest.issues.deleteComment({
      issue_number: issue.number,
      owner: issue.owner,
      repo: issue.repo,
      comment_id: existingComment.id,
    });
  }
}

export async function addPRCommentWithChangeSet(
  changes: Change[],
  previewUrlHost: string,
  prBranchName: string,
  token: string,
  createStack: boolean
): Promise<void> {
  const changeSetTable = getChangeSetTable(changes);
  const markdown = getCommentMarkdown(
    changes,
    changeSetTable,
    previewUrlHost,
    prBranchName,
    createStack
  );

  const issue = github.context.issue;
  const commentId = generateCommentId(issue);
  const body = `${commentId}\n${markdown}`;
  const octokit = github.getOctokit(token);

  await octokit.rest.issues.createComment({
    issue_number: issue.number,
    body: body,
    owner: issue.owner,
    repo: issue.repo,
  });
}
