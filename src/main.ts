import fs from 'node:fs';
import path from 'node:path';
import { setFailed, debug, notice, getInput } from '@actions/core';
import {
  CloudFormationClient,
  ListStacksCommand,
  StackSummary,
} from '@aws-sdk/client-cloudformation';
import * as ansi from './ansi.js';

const cfTemplateBody = fs.readFileSync(
  path.resolve('cloudformation', 's3bucket_with_cloudfront.yml'),
  'utf8'
);

async function getAllStacks(
  client: CloudFormationClient,
  nextToken?: string,
  allStacks: StackSummary[] = []
): Promise<StackSummary[]> {
  const command = new ListStacksCommand({
    NextToken: nextToken,
  });
  const response = await client.send(command);
  const stacks = allStacks.concat(response.StackSummaries || []);
  if (response.NextToken) {
    return getAllStacks(client, response.NextToken, stacks);
  }
  debug(`Found ${stacks.length} stacks`);
  return stacks;
}

async function getExistingStack(
  client: CloudFormationClient,
  cfStackName: string
): Promise<StackSummary | void> {
  debug(`Searching for existing stack with name: ${cfStackName}`);
  const allStacks = await getAllStacks(client);
  return allStacks.find((stack) => stack.StackName === cfStackName);
}

async function hasCreatedStack(
  client: CloudFormationClient,
  cfStackName: string
): Promise<boolean> {
  const stack = await getExistingStack(client, cfStackName);
  return stack !== undefined;
}

async function updateExistingStack(
  client: CloudFormationClient,
  cfStackName: string
): Promise<void> {
  notice(`${ansi.green}Updating existing stack, this can take a while...`);
  // const command = new UpdateStackCommand({
  //   StackName: cfStackName,
  //   TemplateBody: cfTemplateBody,
  // });
  // return client.send(command);
}

async function createNewStack(
  client: CloudFormationClient,
  cfStackName: string
): Promise<void> {
  notice('\u001b[32mCreating new stack, this can take a while...');
  // const command = new CreateStackCommand({
  //   StackName: cfStackName,
  //   TemplateBody: cfTemplateBody,
  // });
  // return client.send(command);
}

function getInputs() {
  const cfStackName = getInput('cfStackName', {
    required: true,
    trimWhitespace: true,
  });
  const s3BucketName = getInput('s3BucketName', {
    required: true,
    trimWhitespace: true,
  });
  const s3AllowedOrigins = getInput('s3AllowedOrigins', {
    required: true,
    trimWhitespace: true,
  });
  const rootCloudFrontHosts = getInput('rootCloudFrontHosts', {
    required: true,
    trimWhitespace: true,
  });
  const previewCloudFrontHosts = getInput('previewCloudFrontHosts', {
    required: true,
    trimWhitespace: true,
  });
  const cacheCorsPathPattern = getInput('cacheCorsPathPattern', {
    required: true,
    trimWhitespace: true,
  });
  const certificateARN = getInput('certificateARN', {
    required: true,
    trimWhitespace: true,
  });

  return {
    cfStackName,
    s3BucketName,
    s3AllowedOrigins,
    rootCloudFrontHosts,
    previewCloudFrontHosts,
    cacheCorsPathPattern,
    certificateARN,
  };
}

async function run(): Promise<void> {
  try {
    const inputs = getInputs();

    const client = new CloudFormationClient({ region: 'us-east-1' });

    const hasExistingStack = await hasCreatedStack(client, inputs.cfStackName);

    debug(`Found existing stack: ${String(hasExistingStack)}`);

    if (hasExistingStack) {
      await updateExistingStack(client, inputs.cfStackName);
    } else {
      await createNewStack(client, inputs.cfStackName);
    }
  } catch (error) {
    if (error instanceof Error) {
      setFailed(error.message);
    }
  } finally {
  }
}

void run();
