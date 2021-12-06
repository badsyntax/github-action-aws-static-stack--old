import { info } from '@actions/core';
import { CloudFormationClient } from '@aws-sdk/client-cloudformation';
import { CloudFrontClient } from '@aws-sdk/client-cloudfront';
import { S3Client } from '@aws-sdk/client-s3';

import {
  CFDistributionId,
  getCloudFrontDistributionId,
} from './cloudformation.js';
import {
  getInvalidationPathsFromKeys,
  invalidateCloudFrontCacheWithPaths,
} from './cloudfront.js';
import { deletePRComment } from './github.js';
import { emptyS3Directory, S3ObjectPrefix, syncFilesToS3 } from './s3.js';

export async function deploySite(
  s3Client: S3Client,
  cloudFormationClient: CloudFormationClient,
  cloudFrontClient: CloudFrontClient,
  cfStackName: string,
  s3BucketName: string,
  outDir: string,
  removeExtensionFromHtmlFiles: boolean,
  cfDistributionId: CFDistributionId,
  prefix: S3ObjectPrefix | string
) {
  const distributionId = await getCloudFrontDistributionId(
    cloudFormationClient,
    cfStackName,
    cfDistributionId
  );
  const syncedFiles = await syncFilesToS3(
    s3Client,
    s3BucketName,
    outDir,
    prefix,
    removeExtensionFromHtmlFiles
  );
  const invalidationPaths = getInvalidationPathsFromKeys(syncedFiles, prefix);
  await invalidateCloudFrontCacheWithPaths(
    cloudFrontClient,
    distributionId,
    invalidationPaths
  );
}

export async function deletePreviewSite(
  s3Client: S3Client,
  cloudFormationClient: CloudFormationClient,
  cloudFrontClient: CloudFrontClient,
  cfStackName: string,
  cfDistributionId: string,
  s3BucketName: string,
  prefix: string,
  token: string
): Promise<void> {
  info(`Attempting to delete preview site at ${prefix}`);
  const distributionId = await getCloudFrontDistributionId(
    cloudFormationClient,
    cfStackName,
    cfDistributionId
  );
  await emptyS3Directory(s3Client, s3BucketName, prefix);
  await deletePRComment(token);
  info(`Successfully removed preview site at ${prefix}`);
  const invalidationPaths = [`${prefix}/*`];
  await invalidateCloudFrontCacheWithPaths(
    cloudFrontClient,
    distributionId,
    invalidationPaths
  );
}
