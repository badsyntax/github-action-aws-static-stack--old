import { info } from '@actions/core';
import {
  CloudFrontClient,
  CreateInvalidationCommand,
  GetInvalidationCommand,
  InvalidationBatch,
} from '@aws-sdk/client-cloudfront';
import path from 'node:path';
import { defaultDelayMs } from './constants.js';
import { delay } from './util.js';

async function waitForInvalidationToComplete(
  client: CloudFrontClient,
  distributionId: string,
  invalidationId: string,
  delayMs = defaultDelayMs
): Promise<void> {
  const output = await client.send(
    new GetInvalidationCommand({
      Id: invalidationId,
      DistributionId: distributionId,
    })
  );
  if (output.Invalidation?.Status !== 'Completed') {
    await delay(delayMs);
    return waitForInvalidationToComplete(
      client,
      distributionId,
      invalidationId,
      delayMs
    );
  }
}
export async function invalidateCloudFrontCache(
  client: CloudFrontClient,
  distributionId: string,
  keys: string[]
): Promise<void> {
  const items = keys
    .filter((key) => path.extname(key).toLowerCase() === '.html')
    .map((file) => '/' + file);
  if (items.length) {
    info('Invalidating CloudFront cache for Preview site...');
    const invalidationBatch: InvalidationBatch = {
      Paths: {
        Quantity: items.length,
        Items: items,
      },
      CallerReference: `invalidate-paths-${Date.now()}`,
    };
    console.log(JSON.stringify(invalidationBatch, null, 2));
    const output = await client.send(
      new CreateInvalidationCommand({
        InvalidationBatch: invalidationBatch,
        DistributionId: distributionId,
      })
    );
    if (!output.Invalidation?.Id) {
      throw new Error('Invalid InvalidationCommand Output');
    }
    await waitForInvalidationToComplete(
      client,
      distributionId,
      output.Invalidation?.Id
    );
  }
}
