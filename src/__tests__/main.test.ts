import { describe, it } from '@jest/globals';
import { getInvalidationPathsFromKeys } from '../cloudfront';

// // shows how the runner will run a javascript action with env / stdout protocol
// describe('test runs', () => {
//   // process.env['INPUT_CFSTACKNAME'] = 'example-com-static-cloudformation-stack';
//   // process.env['INPUT_S3BUCKETNAME'] = 'example.com-us-east-1';
//   // process.env['INPUT_S3ALLOWEDORIGINS'] =
//   //   'https://example.com, https://*.preview.example.com';
//   // process.env['INPUT_ROOTCLOUDFRONTHOSTS'] = 'example.com';
//   // process.env['INPUT_PREVIEWCLOUDFRONTHOSTS'] = '*.preview.example.com';
//   // process.env['INPUT_CACHECORSPATHPATTERN'] = '/_next/*';
//   // process.env['INPUT_CERTIFICATEARN'] =
//   //   'arn:aws:acm:us-east-1:1234567:certificate/123abc-123abc-1234-5678-abcdef';
//   // process.env['INPUT_OUTDIR'] = './out';
//   // const np = process.execPath;
//   // const ip = path.join(__dirname, '..', 'lib', 'main.js');
//   // const options: cp.ExecFileSyncOptions = {
//   //   env: process.env,
//   //   encoding: 'utf-8',
//   // };
//   // try {
//   //   const stdout = cp.execFileSync(np, [ip], options);
//   //   console.log(stdout);
//   // } catch (e) {
//   //   console.error(e);
//   //   throw e;
//   // }
// });

/*
 * For example, when invalidating the URL: branch.preview.example.com/blog.html, the
 * following paths should be used to invalidate it:
 *
 * /blog.html (viewer-request)
 * /blog (viewer-request)
 * /change-1/blog.html (after-lambda-change, with the CF Distribution S3 OriginPath omitted)
 */
describe('getInvalidationPathsFromKeys', () => {
  it('should provide correct root paths', () => {
    const prefix = 'root';
    const keys = ['root/index.html', 'root/css/style.css', 'root/blog.html'];
    const paths = getInvalidationPathsFromKeys(keys, prefix);
    console.log('paths', paths);
  });
});
