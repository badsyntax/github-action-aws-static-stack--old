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

/**
 * See: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Invalidation.html#invalidation-specifying-objects
 *
 * If your CloudFront distribution triggers a Lambda function on viewer request events,
 * and if the function changes the URI of the requested file, we recommend that you
 * invalidate both URIs to remove the file from CloudFront edge caches:
 *
 * - The URI in the viewer request
 * - The URI after the function changed it
 *
 * For example, when invalidating the URL: branch.preview.example.com/blog.html, the
 * following paths should be used to invalidate it:
 *
 * /blog.html (viewer-request)
 * /blog (viewer-request)
 * /change-1/blog.html (after-lambda-change, with the CF Distribution S3 OriginPath omitted)
 */

export function getInvalidationPathsFromKeys(
  keys: string[], // eg ['root/index.html', 'root/css/styles.css', 'preview/branch/blog.html']
  prefix: string
): string[] {
  const pathsByInvalidationType = keys
    .filter((key) => path.extname(key).toLowerCase() === '.html')
    .map((key) => `/${key}`);
  const pathsWithOutPrefix = pathsByInvalidationType.map((path) => {
    return path.replace(`/${prefix}`, '').replace('index.html', '');
  });
  const items = pathsByInvalidationType.concat(pathsWithOutPrefix);
  return items;
  // const items = keysByInvalidationType
  //   .map((file) => {
  //     const path = file.replace(prefix, '');
  //     return [path.replace('index.html', ''), path.replace('.html', '')];
  //   })
  //   .flat();
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
