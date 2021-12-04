import { CloudFormationClient } from '@aws-sdk/client-cloudformation';
import { CloudFrontClient } from '@aws-sdk/client-cloudfront';
import { S3Client } from '@aws-sdk/client-s3';

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
    syncedFiles
  );
}
