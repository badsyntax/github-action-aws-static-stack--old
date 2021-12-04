import { setFailed } from '@actions/core';

import { getInputs } from './github.js';
import {
  getCloudFormationParameters,
  addCommentWithChangeSet,
} from './cloudformation.js';
import * as ansi from './ansi.js';
import { setupS3Bucket, syncFilesToS3 } from './s3.js';
import { invalidateCloudFrontCache } from './cloudfront.js';
import { CloudFormationClient } from '@aws-sdk/client-cloudformation';
import { S3Client } from '@aws-sdk/client-s3';

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

    if (isPullRequest) {
      await addCommentWithChangeSet(
        cloudFormationClient,
        inputs.cfStackName,
        cfParameters,
        inputs.token
      );
    }

    // await createOrUpdateStack(inputs.cfStackName, cfParameters);
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
