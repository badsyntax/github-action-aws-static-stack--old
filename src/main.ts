import { debug, info, notice, setFailed, warning } from '@actions/core';
import github from '@actions/github';
import {
  Change,
  ChangeSetType,
  CloudFormationClient,
  Parameter,
} from '@aws-sdk/client-cloudformation';
import { CloudFrontClient } from '@aws-sdk/client-cloudfront';
import { S3Client } from '@aws-sdk/client-s3';

import {
  getCloudFormationParameters,
  getCreateOrUpdateStack,
  createChangeSet,
  getChanges,
  applyChangeSet,
  deleteChangeSet,
} from './cloudformation.js';
import { getInputs } from './inputs.js';
import { deletePreviewSite, deploySite } from './deploy.js';
import { previewPath, region, rootPath } from './constants.js';
import { addPRCommentWithChangeSet, deletePRComment } from './github.js';

async function updateCloudFormationStack(
  cloudFormationClient: CloudFormationClient,
  cfStackName: string,
  cfParameters: Parameter[]
): Promise<Change[]> {
  const updateStack = await getCreateOrUpdateStack(
    cloudFormationClient,
    cfStackName,
    cfParameters
  );

  const changeSetType = updateStack
    ? ChangeSetType.UPDATE
    : ChangeSetType.CREATE;

  const changeSet = await createChangeSet(
    cloudFormationClient,
    cfStackName,
    changeSetType,
    cfParameters
  );

  const changes = await getChanges(
    cloudFormationClient,
    cfStackName,
    changeSet
  );

  if (changeSet.Id) {
    if (changes.length) {
      info(`Applying ChangeSet, this can take a while...`);
      await applyChangeSet(cloudFormationClient, cfStackName, changeSet.Id);
      notice(`Successfully applied Stack ChangeSet`);
    } else {
      info('(No Stack changes)');
      await deleteChangeSet(cloudFormationClient, cfStackName, changeSet.Id);
      info('Successfully deleted ChangeSet');
    }
  }

  return changes;
}

async function deploy(
  s3Client: S3Client,
  cloudFormationClient: CloudFormationClient,
  cloudFrontClient: CloudFrontClient,
  cfStackName: string,
  s3BucketName: string,
  outDir: string,
  previewUrlHost: string,
  token: string,
  removeExtensionFromHtmlFiles: boolean,
  changes: Change[],
  isPullRequest: boolean,
  prBranchName?: string
) {
  if (isPullRequest) {
    if (!prBranchName) {
      throw new Error('Unable to determine head branch name');
    }
    info('Deploying Preview site...');
    await deploySite(
      s3Client,
      cloudFormationClient,
      cloudFrontClient,
      cfStackName,
      s3BucketName,
      outDir,
      removeExtensionFromHtmlFiles,
      'CFDistributionPreviewId',
      `${previewPath}/${prBranchName}`
    );
    await deletePRComment(token);
    await addPRCommentWithChangeSet(
      changes,
      previewUrlHost,
      prBranchName,
      token
    );
  } else {
    info('Deploying Root site...');
    await deploySite(
      s3Client,
      cloudFormationClient,
      cloudFrontClient,
      cfStackName,
      s3BucketName,
      outDir,
      removeExtensionFromHtmlFiles,
      'CFDistributionId',
      rootPath
    );
  }
}

function checkIsValidGitHubEvent() {
  const action = github.context.action;
  switch (github.context.eventName) {
    case 'repository_dispatch':
    case 'workflow_dispatch':
    case 'push':
      return true;
    case 'pull_request':
      return ['opened', 'synchronize', 'reopened', 'closed'].includes(action);
  }
  throw new Error(`Invalid GitHub event: ${github.context.eventName}`);
}

export async function run(): Promise<void> {
  try {
    checkIsValidGitHubEvent();

    const inputs = getInputs();
    const isPullRequest = github.context.eventName === 'pull_request';
    const isPullRequestClosed =
      isPullRequest && github.context.action === 'closed';
    const prBranchName = github.context.payload.pull_request?.head.ref;

    debug(`isPullRequest: ${isPullRequest}`);
    debug(`isPullRequestClosed: ${isPullRequestClosed}`);
    debug(`prBranchName: ${prBranchName}`);

    const cloudFormationClient = new CloudFormationClient({
      region,
    });
    const s3Client = new S3Client({
      region,
    });
    const cloudFrontClient = new CloudFrontClient({
      region,
    });

    if (isPullRequestClosed) {
      if (inputs.deletePreviewSiteOnPRClose) {
        await deletePreviewSite(
          s3Client,
          cloudFormationClient,
          cloudFrontClient,
          inputs.cfStackName,
          'CFDistributionPreviewId',
          inputs.s3BucketName,
          `${previewPath}/${prBranchName}`,
          inputs.token
        );
      }
    } else {
      const cfParameters = getCloudFormationParameters(
        inputs.cfStackName,
        inputs.s3BucketName,
        inputs.s3AllowedOrigins,
        inputs.rootCloudFrontHosts,
        inputs.previewCloudFrontHosts,
        inputs.cacheCorsPathPattern,
        inputs.certificateARN,
        inputs.lambdaVersion,
        inputs.removeExtensionFromHtmlFiles
      );

      if (!inputs.executeStackChangeSet) {
        warning(
          `Skipping Stack creation as executeStackChangeSet input is set to: ${inputs.executeStackChangeSet}`
        );
      }
      const changes = inputs.executeStackChangeSet
        ? await updateCloudFormationStack(
            cloudFormationClient,
            inputs.cfStackName,
            cfParameters
          )
        : [];

      await deploy(
        s3Client,
        cloudFormationClient,
        cloudFrontClient,
        inputs.cfStackName,
        inputs.s3BucketName,
        inputs.outDir,
        inputs.previewUrlHost,
        inputs.token,
        inputs.removeExtensionFromHtmlFiles,
        changes,
        isPullRequest,
        prBranchName
      );
    }
  } catch (error) {
    if (error instanceof Error) {
      setFailed(error.message);
    } else {
      setFailed('Unknown error');
    }
  }
}

void run();
