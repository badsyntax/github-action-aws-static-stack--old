import path from 'node:path';
import { info } from '@actions/core';
import {
  CloudFrontClient,
  CreateInvalidationCommand,
  GetInvalidationCommand,
  InvalidationBatch,
} from '@aws-sdk/client-cloudfront';

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
  keys: string[],
  prefix: string
): Promise<void> {
  const items = keys
    .filter((key) => path.extname(key).toLowerCase() === '.html')
    .map((file) => {
      const path = file.replace(prefix, '');
      return [path.replace('index.html', ''), path.replace('.html', '')];
    })
    .flat();

  if (items.length) {
    const invalidationBatch: InvalidationBatch = {
      Paths: {
        Quantity: items.length,
        Items: items,
      },
      CallerReference: `invalidate-paths-${Date.now()}`,
    };
    const output = await client.send(
      new CreateInvalidationCommand({
        InvalidationBatch: invalidationBatch,
        DistributionId: distributionId,
      })
    );
    if (!output.Invalidation?.Id) {
      throw new Error('Invalid InvalidationCommand Output');
    }
    info('Requested a Cloudfront Cache Invalidation, waiting...');
    await waitForInvalidationToComplete(
      client,
      distributionId,
      output.Invalidation.Id
    );
    info(
      `Successfully invalidated CloudFront cache (${items.length} items) with paths:`
    );
    info(`${JSON.stringify(items, null, 2)}`);
  }
}
