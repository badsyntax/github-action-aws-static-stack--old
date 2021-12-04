import { info, notice, setFailed } from '@actions/core';

import { getInputs } from './github.js';
import {
  getCloudFormationParameters,
  addCommentWithChangeSet,
  describeStack,
  getCreateOrUpdateStack,
  createNewStack,
  updateExistingStack,
  createChangeSet,
  getChanges,
  applyChangeSet,
  deleteChangeSet,
} from './cloudformation.js';
import * as ansi from './ansi.js';
import { setupS3Bucket, syncFilesToPreview, syncFilesToS3 } from './s3.js';
import { invalidateCloudFrontCache } from './cloudfront.js';
import {
  ChangeSetType,
  CloudFormationClient,
} from '@aws-sdk/client-cloudformation';
import { CloudFrontClient } from '@aws-sdk/client-cloudfront';
import { S3Client } from '@aws-sdk/client-s3';
import { deployPreviewSite } from './deploy.js';

const isPullRequest = true;

async function run(): Promise<void> {
  try {
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

    const update = await getCreateOrUpdateStack(
      cloudFormationClient,
      inputs.cfStackName,
      cfParameters
    );
    const changeSetType = update ? ChangeSetType.UPDATE : ChangeSetType.CREATE;
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
      // await deployPreviewSite(
      //   s3Client,
      //   cloudFrontClient,
      //   inputs.s3BucketName,
      //   inputs.outDir
      // );
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
        info(`Successfully deleted Stack ChangeSet`);
      }
    }

    if (isPullRequest) {
      await deployPreviewSite(
        s3Client,
        cloudFormationClient,
        cloudFrontClient,
        inputs.cfStackName,
        inputs.s3BucketName,
        inputs.outDir
      );
    }
    // await setupS3Bucket(s3Client, inputs.s3BucketName);
    // const uploadedKeys = await syncFilesToS3(
    // s3Client
    //   inputs.s3BucketName,
    //   inputs.outDir,
    //   region,
    //   'root'
    // );
    // await invalidateCloudFrontCache(uploadedKeys);
  } catch (error) {
    if (error instanceof Error) {
      setFailed(error.message);
    } else {
      setFailed('Unknown error');
    }
  }
}

void run();
