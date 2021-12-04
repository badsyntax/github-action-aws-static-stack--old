import { CloudFrontClient } from '@aws-sdk/client-cloudfront';
import { S3Client } from '@aws-sdk/client-s3';
import { invalidateCloudFrontCache } from './cloudfront.js';
import { syncFilesToPreview } from './s3.js';

export async function deployPreviewSite(
  s3Client: S3Client,
  cloudFrontClient: CloudFrontClient,
  s3BucketName: string,
  cloudFrontDistributionId: string,
  outDir: string
) {
  const syncedFiles = await syncFilesToPreview(s3Client, s3BucketName, outDir);
  await invalidateCloudFrontCache(
    cloudFrontClient,
    cloudFrontDistributionId,
    syncedFiles
  );
}
