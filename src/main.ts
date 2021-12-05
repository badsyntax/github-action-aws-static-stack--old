import { info, notice, setFailed } from '@actions/core';
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
import { getInputs } from './github.js';
import { addPRCommentWithChangeSet, deploySite } from './deploy.js';
import { previewPath, region, rootPath } from './constants.js';

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
  changes: Change[]
) {
  const isPullRequest = github.context.eventName === 'pull_request';

  if (isPullRequest) {
    const prBranchName = github.context.payload.pull_request?.head.ref;
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
      'CFDistributionPreviewId',
      `${previewPath}/${prBranchName}`
    );
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
      'CFDistributionId',
      rootPath
    );
  }
}

async function run(): Promise<void> {
  try {
    const inputs = getInputs();

    const cfParameters = getCloudFormationParameters(
      inputs.cfStackName,
      inputs.s3BucketName,
      inputs.s3AllowedOrigins,
      inputs.rootCloudFrontHosts,
      inputs.previewCloudFrontHosts,
      inputs.cacheCorsPathPattern,
      inputs.certificateARN,
      inputs.lambdaVersion
    );

    const cloudFormationClient = new CloudFormationClient({
      region,
    });
    const s3Client = new S3Client({
      region,
    });
    const cloudFrontClient = new CloudFrontClient({
      region,
    });

    const changes = await updateCloudFormationStack(
      cloudFormationClient,
      inputs.cfStackName,
      cfParameters
    );

    await deploy(
      s3Client,
      cloudFormationClient,
      cloudFrontClient,
      inputs.cfStackName,
      inputs.s3BucketName,
      inputs.outDir,
      inputs.previewUrlHost,
      inputs.token,
      changes
    );
  } catch (error) {
    if (error instanceof Error) {
      setFailed(error.message);
    } else {
      setFailed('Unknown error');
    }
  }
}

void run();
