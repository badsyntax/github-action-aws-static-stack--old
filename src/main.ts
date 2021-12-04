import { setFailed } from '@actions/core';

import { getInputs } from './github.js';
import {
  getCloudFormationParameters,
  createOrUpdateStack,
} from './cloudformation.js';
import * as ansi from './ansi.js';
import { setupS3Bucket, syncRootFilesToS3 } from './s3.js';

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
    // await createOrUpdateStack(inputs.cfStackName, cfParameters);
    // await setupS3Bucket(inputs.s3BucketName);
    // await syncRootFilesToS3(inputs.s3BucketName, inputs.outDir, region);
  } catch (error) {
    if (error instanceof Error) {
      setFailed(`${ansi.red}${error.message}${ansi.reset}`);
    }
  }
}

void run();
