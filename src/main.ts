import { info, notice, setFailed } from '@actions/core';
import github from '@actions/github';
import {
  ChangeSetType,
  CloudFormationClient,
} from '@aws-sdk/client-cloudformation';
import { CloudFrontClient } from '@aws-sdk/client-cloudfront';
import { S3Client } from '@aws-sdk/client-s3';

import {
  getCloudFormationParameters,
  addCommentWithChangeSet,
  getCreateOrUpdateStack,
  createChangeSet,
  getChanges,
  applyChangeSet,
  deleteChangeSet,
} from './cloudformation.js';
import { getInputs } from './github.js';
import { deploySite } from './deploy.js';

async function run(): Promise<void> {
  try {
    const isPullRequest = github.context.eventName === 'pull_request';
    const inputs = getInputs();
    const lambdaVersion = '1-0-0';
    const region = 'us-east-1';

    const cfParameters = getCloudFormationParameters(
      inputs.cfStackName,
      inputs.s3BucketName,
      inputs.s3AllowedOrigins,
      inputs.rootCloudFrontHosts,
      inputs.previewCloudFrontHosts,
      inputs.cacheCorsPathPattern,
      inputs.certificateARN,
      lambdaVersion
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

    const updateStack = await getCreateOrUpdateStack(
      cloudFormationClient,
      inputs.cfStackName,
      cfParameters
    );

    const changeSetType = updateStack
      ? ChangeSetType.UPDATE
      : ChangeSetType.CREATE;

    const changeSet = await createChangeSet(
      cloudFormationClient,
      inputs.cfStackName,
      changeSetType,
      cfParameters
    );

    const changes = await getChanges(
      cloudFormationClient,
      inputs.cfStackName,
      changeSet
    );

    if (isPullRequest) {
      await addCommentWithChangeSet(changes, inputs.token);
    }

    if (changeSet.Id) {
      if (changes.length) {
        info(`Applying ChangeSet, this can take a while...`);
        await applyChangeSet(
          cloudFormationClient,
          inputs.cfStackName,
          changeSet.Id
        );
        notice(`Successfully applied Stack ChangeSet`);
      } else {
        await deleteChangeSet(
          cloudFormationClient,
          inputs.cfStackName,
          changeSet.Id
        );
      }
    }

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
        inputs.cfStackName,
        inputs.s3BucketName,
        inputs.outDir,
        'CFDistributionPreviewId',
        `preview/${prBranchName}`
      );
    } else {
      info('Deploying Root site...');
      await deploySite(
        s3Client,
        cloudFormationClient,
        cloudFrontClient,
        inputs.cfStackName,
        inputs.s3BucketName,
        inputs.outDir,
        'CFDistributionId',
        'root'
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
