import path from 'node:path';
import { info } from '@actions/core';
import {
  CloudFrontClient,
  CreateInvalidationCommand,
  GetInvalidationCommand,
  InvalidationBatch,
} from '@aws-sdk/client-cloudfront';
import { CloudFormationClient } from '@aws-sdk/client-cloudformation';

import { defaultDelayMs, previewPath } from './constants.js';
import { delay } from './util.js';
import { describeStack } from './cloudformation.js';

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
  keys: string[], // eg ['root/index.html', 'root/css/styles.css']
  prefix: string
): string[] {
  const pathsToInvalidate = keys
    .filter((key) => {
      const ext = path.extname(key).toLowerCase();
      return ext === '.html' || ext === '';
    })
    .map((key) => `/${key}`);

  const pathsWithOutPrefix = pathsToInvalidate.map((path) => {
    return path.replace(`/${prefix}`, '');
  });

  const hasIndex = pathsWithOutPrefix.find(
    (path) => path.endsWith('index.html') || path.endsWith('index')
  );

  if (hasIndex) {
    pathsWithOutPrefix.push('/');
  }

  const previewPathsWithoutOriginPath = pathsToInvalidate
    .filter((path) => path.startsWith(`/${previewPath}`))
    .map((path) => path.replace(`/${previewPath}`, ''));

  const items = previewPathsWithoutOriginPath.concat(pathsWithOutPrefix);
  const uniqueItems = [...new Set(items)];

  return uniqueItems;
}

export async function invalidateCloudFrontCacheWithPaths(
  client: CloudFrontClient,
  distributionId: string,
  paths: string[]
): Promise<void> {
  if (paths.length) {
    info('Requesting a Cloudfront Cache Invalidation for the following paths:');
    info(`${JSON.stringify(paths, null, 2)}`);
    const invalidationBatch: InvalidationBatch = {
      Paths: {
        Quantity: paths.length,
        Items: paths,
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
    await waitForInvalidationToComplete(
      client,
      distributionId,
      output.Invalidation.Id
    );
    info(
      `Successfully invalidated CloudFront cache with ${paths.length} paths`
    );
  }
}
