import { info } from '@actions/core';
import {
  CloudFrontClient,
  CreateInvalidationCommand,
  InvalidationBatch,
} from '@aws-sdk/client-cloudfront';
import path from 'node:path';

export async function invalidateCloudFrontCache(
  client: CloudFrontClient,
  distributionId: string,
  keys: string[]
): Promise<void> {
  const htmlKeys = keys.filter((key) => {
    const ext = path.extname(key).toLowerCase();
    return ext === '.html';
  });
  const invalidationBatch: InvalidationBatch = {
    Paths: {
      Quantity: htmlKeys.length,
      Items: htmlKeys,
    },
    CallerReference: `invalidate-paths-${Date.now()}`,
  };
  await client.send(
    new CreateInvalidationCommand({
      InvalidationBatch: invalidationBatch,
      DistributionId: distributionId,
    })
  );
}
