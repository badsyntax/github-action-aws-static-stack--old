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
  CreateChangeSetCommand,
  ChangeSetType,
  DescribeChangeSetCommand,
  Change,
  ChangeSetStatus,
  CreateChangeSetCommandOutput,
  DeleteChangeSetCommand,
  DeleteChangeSetCommandOutput,
  ExecuteChangeSetCommand,
} from '@aws-sdk/client-cloudformation';

import { defaultDelayMs } from './constants.js';
import { delay } from './util.js';

export type CFDistributionId = 'CFDistributionPreviewId' | 'CFDistributionId';

const cfTemplateBody = fs.readFileSync(
  path.resolve('cloudformation', 's3bucket_with_cloudfront.yml'),
  'utf8'
);

type logMap = {
  [key: string]: boolean;
};

const logs: {
  [key: string]: logMap;
} = {
  stackStatusLogs: {},
  changeSetStatusLogs: {},
};

function logStackStatus(status: string): void {
  if (!(status in logs.stackStatusLogs)) {
    logs.stackStatusLogs[status] = true;
    if (status === String(StackStatus.ROLLBACK_IN_PROGRESS)) {
      warning(
        `${StackStatus.ROLLBACK_IN_PROGRESS} detected! **Check the CloudFormation events in the AWS Console for more information.** ` +
          `${StackStatus.ROLLBACK_IN_PROGRESS} can take a while to complete. ` +
          `You can manually delete the CloudFormation stack in the AWS Console or just wait until this process completes...`
      );
    }
    info(`Stack Status: ${status}`);
  }
}

function resetStatusLogs(): void {
  logs.stackStatusLogs = {};
}

function logChangeSetStatus(status: string): void {
  if (!(status in logs.changeSetStatusLogs)) {
    logs.changeSetStatusLogs[status] = true;
    info(`ChangeSet: ${status}`);
  }
}

function resetChangeSetStatusLogs(): void {
  logs.changeSetStatusLogs = {};
}

export function getCloudFormationParameters(
  cfProjectName: string,
  s3BucketName: string,
  s3AllowedOrigins: string,
  rootCloudFrontHosts: string,
  previewCloudFrontHosts: string,
  cacheCorsPathPattern: string,
  certificateARN: string,
  lambdaVersion: string,
  removeExtensionFromHtmlFiles: boolean
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
    {
      ParameterKey: 'CloudFrontDefaultRootObject',
      ParameterValue: removeExtensionFromHtmlFiles ? 'index' : 'index.html',
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
  delayMs = defaultDelayMs
): Promise<void> {
  try {
    const stack = await describeStack(client, cfStackName);
    const stackStatus = String(stack.StackStatus);
    logStackStatus(stackStatus);
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

export async function applyChangeSet(
  client: CloudFormationClient,
  cfStackName: string,
  changeSetId: string
): Promise<void> {
  await client.send(
    new ExecuteChangeSetCommand({
      StackName: cfStackName,
      ChangeSetName: changeSetId,
    })
  );
  await waitForCompleteOrFailed(client, cfStackName);
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
  delayMs = defaultDelayMs,
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
    logStackStatus(status);
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

export function shouldDeleteExistingStack(stack: Stack): boolean {
  // If the StackStatus is ROLLBACK_COMPLETE then we cannot update it
  // and instead need to delete it and re-create it.
  return stack.StackStatus === StackStatus.ROLLBACK_COMPLETE;
}

export async function createChangeSet(
  client: CloudFormationClient,
  cfStackName: string,
  changeSetType: ChangeSetType,
  parameters: Parameter[]
) {
  return client.send(
    new CreateChangeSetCommand({
      TemplateBody: cfTemplateBody,
      StackName: cfStackName,
      ChangeSetName: `test-changeset-${Date.now()}`,
      ChangeSetType: changeSetType,
      Parameters: parameters,
      Capabilities: [Capability.CAPABILITY_IAM],
    })
  );
}

export async function deleteChangeSet(
  client: CloudFormationClient,
  cfStackName: string,
  changeSetId: string
): Promise<DeleteChangeSetCommandOutput> {
  return client.send(
    new DeleteChangeSetCommand({
      StackName: cfStackName,
      ChangeSetName: changeSetId,
    })
  );
}

export async function describeChangeSet(
  client: CloudFormationClient,
  cfStackName: string,
  changeSetId: string,
  nextToken?: string,
  delayMs = defaultDelayMs
): Promise<Change[]> {
  const response = await client.send(
    new DescribeChangeSetCommand({
      StackName: cfStackName,
      ChangeSetName: changeSetId,
      NextToken: nextToken,
    })
  );
  if (response.Status === ChangeSetStatus.FAILED) {
    debug(`ChangeSet failed: ${response.StatusReason}`);
    return [];
  }
  if (response.NextToken) {
    return await describeChangeSet(
      client,
      cfStackName,
      changeSetId,
      response.NextToken
    );
  }
  logChangeSetStatus(String(response.Status));
  if (response.Status !== ChangeSetStatus.CREATE_COMPLETE) {
    await delay(delayMs);
    return await describeChangeSet(
      client,
      cfStackName,
      changeSetId,
      response.NextToken
    );
  }
  resetChangeSetStatusLogs();
  return response.Changes || [];
}

export async function getChanges(
  client: CloudFormationClient,
  cfStackName: string,
  changeSet: CreateChangeSetCommandOutput
) {
  if (!changeSet.Id) {
    throw new Error('ChangSet did not generate an ARN');
  }
  info(`Generating list of Stack changes...`);
  return describeChangeSet(client, cfStackName, changeSet.Id);
}

export async function getCreateOrUpdateStack(
  client: CloudFormationClient,
  cfStackName: string,
  parameters: Parameter[]
): Promise<boolean> {
  const hasExistingStack = await hasCreatedStack(client, cfStackName);

  debug(`Found existing stack: ${String(hasExistingStack)}`);
  debug(
    `Using parameters: ${parameters
      .map((p) => `${p.ParameterKey}: ${p.ParameterValue}`)
      .join(', ')}`
  );

  let update = false;

  if (hasExistingStack) {
    const stack = await describeStack(client, cfStackName);
    const shouldDelete = await shouldDeleteExistingStack(stack);
    if (shouldDelete) {
      warning(
        `Deleting existing stack ${cfStackName}, due to ${StackStatus.ROLLBACK_COMPLETE} status`
      );
      await deleteExistingStack(client, cfStackName);
    } else {
      update = true;
    }
  }

  return update;
}

export async function getCloudFrontDistributionId(
  cloudFormationClient: CloudFormationClient,
  cfStackName: string,
  cfDistributionId: string
): Promise<string> {
  const stack = await describeStack(cloudFormationClient, cfStackName);
  const distributionIdOutput = (stack.Outputs || []).find(
    (output) => output.OutputKey === cfDistributionId
  );
  if (!distributionIdOutput?.OutputValue) {
    throw new Error('CFDistributionPreviewId output not found');
  }
  return distributionIdOutput.OutputValue;
}
