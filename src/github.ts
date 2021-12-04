import { getInput } from '@actions/core';

export function getInputs() {
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
