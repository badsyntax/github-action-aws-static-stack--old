import { Change, CloudFormationClient } from '@aws-sdk/client-cloudformation';
import { CloudFrontClient } from '@aws-sdk/client-cloudfront';
import { S3Client } from '@aws-sdk/client-s3';
import github from '@actions/github';
import { markdownTable } from 'markdown-table';

import { CFDistributionId, describeStack } from './cloudformation.js';
import { invalidateCloudFrontCache } from './cloudfront.js';
import { S3ObjectPrefix, syncFilesToS3 } from './s3.js';

export async function deploySite(
  s3Client: S3Client,
  cloudFormationClient: CloudFormationClient,
  cloudFrontClient: CloudFrontClient,
  cfStackName: string,
  s3BucketName: string,
  outDir: string,
  cfDistributionId: CFDistributionId,
  prefix: S3ObjectPrefix | string
) {
  const stack = await describeStack(cloudFormationClient, cfStackName);
  const distributionIdOutput = (stack.Outputs || []).find(
    (output) => output.OutputKey === cfDistributionId
  );
  if (!distributionIdOutput?.OutputValue) {
    throw new Error('CFDistributionPreviewId output not found');
  }
  const syncedFiles = await syncFilesToS3(
    s3Client,
    s3BucketName,
    outDir,
    prefix
  );
  await invalidateCloudFrontCache(
    cloudFrontClient,
    distributionIdOutput.OutputValue,
    syncedFiles,
    prefix
  );
}

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

function getCommentMarkdown(
  changes: Change[],
  changeSetTable: string,
  previewUrlHost: string,
  prBranchName: string
): string {
  const previewUrl = `https://${prBranchName}.${previewUrlHost}`;
  return `${
    changes.length
      ? `
The following Stack changes have been applied:

${changeSetTable}
`
      : `
(No Stack changes)`
  }

🎉 Preview site deployed to: [${previewUrl}](${previewUrl})
  `;
}

function generateCommentId(issue: typeof github.context.issue): string {
  return `AWS Stack Change (ID:${issue.number})`;
}

export async function addPRCommentWithChangeSet(
  changes: Change[],
  previewUrlHost: string,
  prBranchName: string,
  token: string
): Promise<void> {
  const changeSetTable = getChangeSetTable(changes);
  const markdown = getCommentMarkdown(
    changes,
    changeSetTable,
    previewUrlHost,
    prBranchName
  );

  const issue = github.context.issue;
  const commentId = generateCommentId(github.context.issue);
  const body = `${commentId}\n${markdown}`;
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
      body: body,
      owner: issue.owner,
      repo: issue.repo,
      comment_id: existingComment.id,
    });
  }
  await octokit.rest.issues.createComment({
    issue_number: issue.number,
    body: body,
    owner: issue.owner,
    repo: issue.repo,
  });
}
