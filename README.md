# AWS Static Stack GitHub Action

A GitHub Action to deploy your static website to the AWS Edge 🔥.

_CURRENTLY IN ALPHA - NOT FIT FOR PUBLIC USE_

Includes:

- S3 for hosting files
- Cloudfront for Edge caching
- Caching headers configured correctly
- AWS Stack create/update (via CloudFormation)
- Preview websites (eg `branchname.preview.example.com`)
- File sync and invalidation by contents hash

## Getting Started

Before beginning you should understand the following:

- Various AWS resources will be created which which incur costs on your AWS account
- All AWS resources are created in the `us-east-1` region, as this is where the CloudFront control pane sits and requires resources (eg certificates & buckets) to be created in the same region. Also, there would be additional S3 data transfer charges if the Lambda@Edge executions are happening in a different AWS Region from where your source S3 bucket is located.

## Usage

First you need to create a certificate for your root and preview hosts, in the `us-east-1` region.

Open the [AWS Certificate Manager](https://console.aws.amazon.com/acm/home?region=us-east-1) and Request a new public certificate for the following domains:

- `example.com`
- `*.example`
- `*.preview.example.com`

Once the certificate is created & verified, copy the Certificate ARN and use it to configure the action:

```yaml
steps:
  - uses: actions/checkout@v2
  - name: Configure AWS Credentials
    uses: aws-actions/configure-aws-credentials@v1
    with:
      aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
      aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
      aws-region: us-east-1
  - uses: ./
    with:
      outDir: './out'
      token: ${{ secrets.GITHUB_TOKEN }}
      lambdaVersion: '1.0.0'
      cfStackName: 'static-example-richardwillis-cloudformation-stack'
      s3BucketName: 'static-example-richardwillis-info-us-east-1'
      s3AllowedOrigins: 'https://example.com, https://*.preview.example.com'
      rootCloudFrontHosts: 'example.com'
      previewCloudFrontHosts: '*.preview.example.com'
      previewUrlHost: 'preview.example.com'
      cacheCorsPathPattern: '/_next/*'
      certificateARN: 'arn:aws:acm:us-east-1:1234567:certificate/123abc-123abc-1234-5678-abcdef'
```

Next send a Pull Request to trigger the action.

- The Stack will be created/updated, and a new preview site deployed, for every Pull Request
- The Stack will be created/updated, and the root site deployed, for every push event to master/main/release branch

## Caching Strategy

- Immutable static files (eg images, JavaScript, CSS etc) are cached by both the browser and the Edge for 1 year. (Files can only be immutable if they do not change and typically use hashed filenames.)
- Mutable HTML files are cached by the Edge for 1 year, but never cached in the browser.
- Edge cache is invalidated on new deployments for changed HTML files.

## AWS Stack Overview

### S3

A single S3 bucket is used to host both the root and preview websites with the following directory structure:

```console
├── preview/
│   └── branchname/
└── root/
```

### Edge Lambda

An edge lambda is used to route preview requests to the correct location in S3.

### CloudFront

2 CloudFront distributions are used:

1. For serving the root domain, eg example.com
2. For serving the preview domain, eg branchname.preview.example.com

2 distributions are required to ensure the fastest possible edge caching for the root domain, as an Edge Lambda is used for preview sites.
