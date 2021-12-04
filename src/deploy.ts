import { info } from '@actions/core';
import { CloudFormationClient } from '@aws-sdk/client-cloudformation';
import { CloudFrontClient } from '@aws-sdk/client-cloudfront';
import { S3Client } from '@aws-sdk/client-s3';
import { describeStack } from './cloudformation.js';
import { invalidateCloudFrontCache } from './cloudfront.js';
import { syncFilesToPreview } from './s3.js';

export async function deployPreviewSite(
  s3Client: S3Client,
  cloudFormationClient: CloudFormationClient,
  cloudFrontClient: CloudFrontClient,
  cfStackName: string,
  s3BucketName: string,
  outDir: string
) {
  const stack = await describeStack(cloudFormationClient, cfStackName);
  const previewDistributionIdOutput = (stack.Outputs || []).find(
    (output) => output.OutputKey === 'CFDistributionPreviewId'
  );
  if (!previewDistributionIdOutput?.OutputValue) {
    throw new Error('CFDistributionPreviewId output not found');
  }
  const syncedFiles = await syncFilesToPreview(s3Client, s3BucketName, outDir);
  await invalidateCloudFrontCache(
    cloudFrontClient,
    previewDistributionIdOutput.OutputValue,
    syncedFiles
  );
}
