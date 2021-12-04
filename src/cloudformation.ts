import fs from 'node:fs';
import path from 'node:path';
import { debug, info, notice, warning } from '@actions/core';
import {
  Parameter,
  CloudFormationClient,
  StackSummary,
  ListStacksCommand,
  StackStatus,
  UpdateStackCommandOutput,
  UpdateStackCommand,
  CreateStackCommand,
  Capability,
  DescribeStacksCommand,
  DeleteStackCommand,
  Stack,
} from '@aws-sdk/client-cloudformation';
import { logStatus, resetStatusLogs } from './logging.js';

const defaultProgressDelayMs = 3000;

const cfTemplateBody = fs.readFileSync(
  path.resolve('cloudformation', 's3bucket_with_cloudfront.yml'),
  'utf8'
);

function delay(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export function getCloudFormationParameters(
  cfProjectName: string,
  s3BucketName: string,
  s3AllowedOrigins: string,
  rootCloudFrontHosts: string,
  previewCloudFrontHosts: string,
  cacheCorsPathPattern: string,
  certificateARN: string,
  lambdaVersion: string
): Parameter[] {
  return [
    {
      ParameterKey: 'ProjectName',
      ParameterValue: cfProjectName,
    },
    {
      ParameterKey: 'S3BucketName',
      ParameterValue: s3BucketName,
    },
    {
      ParameterKey: 'S3AllowedOrigins',
      ParameterValue: s3AllowedOrigins,
    },
    {
      ParameterKey: 'RootCloudFrontHosts',
      ParameterValue: rootCloudFrontHosts,
    },
    {
      ParameterKey: 'PreviewCloudFrontHosts',
      ParameterValue: previewCloudFrontHosts,
    },
    {
      ParameterKey: 'CacheCorsPathPattern',
      ParameterValue: cacheCorsPathPattern,
    },
    {
      ParameterKey: 'CertificateARN',
      ParameterValue: certificateARN,
    },
    {
      ParameterKey: 'LambdaVersion',
      ParameterValue: lambdaVersion,
    },
  ];
}

export async function getAllStacks(
  client: CloudFormationClient,
  nextToken?: string,
  allStacks: StackSummary[] = []
): Promise<StackSummary[]> {
  const response = await client.send(
    new ListStacksCommand({
      NextToken: nextToken,
    })
  );
  const stacks = allStacks.concat(response.StackSummaries || []);
  if (response.NextToken) {
    return getAllStacks(client, response.NextToken, stacks);
  }
  debug(`Found ${stacks.length} stacks`);
  return stacks;
}

export async function getExistingStack(
  client: CloudFormationClient,
  cfStackName: string
): Promise<StackSummary | void> {
  debug(`Searching for existing stack with name: ${cfStackName}`);
  const allStacks = await getAllStacks(client);
  return allStacks.find(
    (stack) =>
      stack.StackName === cfStackName &&
      stack.StackStatus !== StackStatus.DELETE_COMPLETE
  );
}

export async function hasCreatedStack(
  client: CloudFormationClient,
  cfStackName: string
): Promise<boolean> {
  const stack = await getExistingStack(client, cfStackName);
  return stack !== undefined;
}

export async function updateExistingStack(
  client: CloudFormationClient,
  cfStackName: string,
  parameters: Parameter[]
): Promise<UpdateStackCommandOutput> {
  return client.send(
    new UpdateStackCommand({
      StackName: cfStackName,
      TemplateBody: cfTemplateBody,
    })
  );
}

export async function createNewStack(
  client: CloudFormationClient,
  cfStackName: string,
  parameters: Parameter[]
): Promise<void> {
  await client.send(
    new CreateStackCommand({
      StackName: cfStackName,
      TemplateBody: cfTemplateBody,
      Parameters: parameters,
      Capabilities: [Capability.CAPABILITY_IAM],
    })
  );
  const status = await waitForCompleteOrFailed(client, cfStackName);
  if (status !== String(StackStatus.CREATE_COMPLETE)) {
    throw new Error('Stack creation failed');
  }
  notice(`Stack ${cfStackName} successfully created`);
}

export async function waitForStackStatus(
  client: CloudFormationClient,
  cfStackName: string,
  status: string,
  delayMs = defaultProgressDelayMs
): Promise<void> {
  try {
    const stack = await describeStack(client, cfStackName);
    const stackStatus = String(stack.StackStatus);
    logStatus(stackStatus);
    if (stackStatus !== status) {
      await delay(delayMs);
      await waitForStackStatus(client, cfStackName, status, delayMs);
    }
  } catch (e) {
    debug(
      `Unable to wait for status ${status} because ${(e as Error).message}`
    );
  } finally {
    resetStatusLogs();
  }
}

export async function describeStack(
  client: CloudFormationClient,
  cfStackName: string
): Promise<Stack> {
  const response = await client.send(
    new DescribeStacksCommand({
      StackName: cfStackName,
    })
  );
  if (!response.Stacks?.length) {
    throw new Error('Stack not found');
  }
  return response.Stacks[0];
}

export async function waitForCompleteOrFailed(
  client: CloudFormationClient,
  cfStackName: string,
  delayMs = defaultProgressDelayMs,
  completeOrFailedStatuses = [
    String(StackStatus.CREATE_COMPLETE),
    String(StackStatus.CREATE_FAILED),
    String(StackStatus.DELETE_COMPLETE),
    String(StackStatus.DELETE_FAILED),
    String(StackStatus.IMPORT_COMPLETE),
    String(StackStatus.IMPORT_ROLLBACK_COMPLETE),
    String(StackStatus.IMPORT_ROLLBACK_FAILED),
    String(StackStatus.ROLLBACK_COMPLETE),
    String(StackStatus.ROLLBACK_FAILED),
    String(StackStatus.UPDATE_COMPLETE),
    String(StackStatus.UPDATE_FAILED),
    String(StackStatus.UPDATE_ROLLBACK_COMPLETE),
    String(StackStatus.UPDATE_ROLLBACK_FAILED),
  ]
): Promise<string> {
  try {
    const stack = await describeStack(client, cfStackName);
    const status = String(stack.StackStatus);
    logStatus(status);
    if (!completeOrFailedStatuses.includes(status)) {
      await delay(delayMs);
      return await waitForCompleteOrFailed(client, cfStackName, delayMs);
    }
    return status;
  } catch (e) {
    throw e;
  } finally {
    resetStatusLogs();
  }
}

export async function deleteExistingStack(
  client: CloudFormationClient,
  cfStackName: string
) {
  await client.send(
    new DeleteStackCommand({
      StackName: cfStackName,
    })
  );
  await waitForStackStatus(
    client,
    cfStackName,
    String(StackStatus.DELETE_COMPLETE)
  );
  notice(`Stack ${cfStackName} successfully deleted`);
}

export async function shouldDeleteExistingStack(
  client: CloudFormationClient,
  cfStackName: string
): Promise<boolean> {
  const stack = await describeStack(client, cfStackName);
  // If the StackStatus is ROLLBACK_COMPLETE then we cannot update it
  // and instead need to delete it and re-create it.
  return stack.StackStatus === StackStatus.ROLLBACK_COMPLETE;
}

export async function createOrUpdateStack(
  cfStackName: string,
  parameters: Parameter[]
) {
  const client = new CloudFormationClient({ region: 'us-east-1' });
  const hasExistingStack = await hasCreatedStack(client, cfStackName);
  debug(`Found existing stack: ${String(hasExistingStack)}`);
  debug(
    `Using parameters: ${parameters
      .map((p) => `${p.ParameterKey}: ${p.ParameterValue}`)
      .join(', ')}`
  );

  let update = false;

  if (hasExistingStack) {
    const shouldDelete = await shouldDeleteExistingStack(client, cfStackName);
    if (shouldDelete) {
      warning(
        `Deleting existing stack ${cfStackName}, due to ${StackStatus.ROLLBACK_COMPLETE} status`
      );
      await deleteExistingStack(client, cfStackName);
    } else {
      update = true;
    }
  }

  if (update) {
    info(`Updating existing stack, this can take a while...`);
    await updateExistingStack(client, cfStackName, parameters);
  } else {
    info(`Creating new stack, this can take a while...`);
    await createNewStack(client, cfStackName, parameters);
  }
}
