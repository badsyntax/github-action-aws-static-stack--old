import * as process from 'process';
import * as cp from 'child_process';
import * as path from 'path';
import { expect, test } from '@jest/globals';

// shows how the runner will run a javascript action with env / stdout protocol
test('test runs', () => {
  // process.env['INPUT_CFSTACKNAME'] = 'example-com-static-cloudformation-stack';
  // process.env['INPUT_S3BUCKETNAME'] = 'example.com-us-east-1';
  // process.env['INPUT_S3ALLOWEDORIGINS'] =
  //   'https://example.com, https://*.preview.example.com';
  // process.env['INPUT_ROOTCLOUDFRONTHOSTS'] = 'example.com';
  // process.env['INPUT_PREVIEWCLOUDFRONTHOSTS'] = '*.preview.example.com';
  // process.env['INPUT_CACHECORSPATHPATTERN'] = '/_next/*';
  // process.env['INPUT_CERTIFICATEARN'] =
  //   'arn:aws:acm:us-east-1:1234567:certificate/123abc-123abc-1234-5678-abcdef';
  // const np = process.execPath;
  // const ip = path.join(__dirname, '..', 'lib', 'main.js');
  // const options: cp.ExecFileSyncOptions = {
  //   env: process.env,
  //   encoding: 'utf-8',
  // };
  // try {
  //   const stdout = cp.execFileSync(np, [ip], options);
  //   console.log(stdout);
  // } catch (e) {
  //   console.error(e);
  //   throw e;
  // }
});
