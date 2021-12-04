import { setFailed } from '@actions/core';

import { getInputs } from './github.js';
import { getCloudFormationParameters, createOrUpdateStack } from './aws.js';
import * as ansi from './ansi.js';

async function run(): Promise<void> {
  try {
    const inputs = getInputs();
    const lambdaVersion = '1-0-0';
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
    await createOrUpdateStack(inputs.cfStackName, cfParameters);
  } catch (error) {
    if (error instanceof Error) {
      setFailed(`${ansi.red}${error.message}${ansi.reset}`);
    }
  }
}

void run();
