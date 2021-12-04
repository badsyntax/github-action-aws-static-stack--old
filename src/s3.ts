import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import mime from 'mime-types';
import {
  HeadObjectCommand,
  HeadObjectCommandOutput,
  ListObjectsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import glob from '@actions/glob';
import { info } from '@actions/core';

type S3ObjectPrefix = 'root' | 'preview';

// We don't need to explicity ensure the root keys exist as they will be created
// when objects are uploaded.
export async function setupS3Bucket(s3BucketName: string): Promise<void> {
  const client = new S3Client({
    region: 'us-east-1',
  });
  const response = await client.send(
    new ListObjectsCommand({
      Bucket: s3BucketName,
      Delimiter: '/',
    })
  );
  const commonPrefixes = response.CommonPrefixes || [];
  const hasPreviewDirectory = !!commonPrefixes.find(
    ({ Prefix }) => Prefix === 'preview/'
  );
  const hasRootDirectory = !!commonPrefixes.find(
    ({ Prefix }) => Prefix === 'root/'
  );
  console.log('hasPreviewDirectory', hasPreviewDirectory);
  console.log('hasRootDirectory', hasRootDirectory);
}

export async function getObjectMetadata(
  client: S3Client,
  s3BucketName: string,
  key: string
): Promise<HeadObjectCommandOutput | void> {
  try {
    return await client.send(
      new HeadObjectCommand({
        Bucket: s3BucketName,
        Key: key,
      })
    );
  } catch (e) {
    return undefined;
  }
}

function getObjectKeyFromFilePath(
  rootFilePath: string,
  absoluteFilePath: string,
  prefix: S3ObjectPrefix = 'root'
): string {
  return path.join(prefix, path.relative(rootFilePath, absoluteFilePath));
}

function getCacheControlForExtension(extension: string): string {
  switch (extension) {
    case '.html':
      return 'public,max-age=0,s-maxage=31536000,must-revalidate';
    default:
      return 'public,max-age=31536000,immutable';
  }
}

function getContentTypeForExtension(extension: string): string {
  const contentType = mime.lookup(extension);
  if (contentType === false) {
    throw new Error(`Unable to detect content-type for ${extension}`);
  }
  return contentType;
}

async function uploadFile(
  client: S3Client,
  s3BucketName: string,
  key: string,
  absoluteFilePath: string,
  cacheControl: string,
  contentType: string
) {
  await client.send(
    new PutObjectCommand({
      Bucket: s3BucketName,
      Key: key,
      CacheControl: cacheControl,
      ContentType: contentType,
      Body: fs.createReadStream(absoluteFilePath),
    })
  );
  info(`Uploaded ${key}`);
}

function getETag(absoluteFilePath: string): string {
  const fileContents = fs.readFileSync(absoluteFilePath, 'utf-8');
  const base64ETag = Buffer.from(
    crypto.createHash('md5').update(fileContents).digest('hex'),
    'base64'
  ).toString('base64');
  return JSON.stringify(base64ETag);
}

export async function maybeUploadFile(
  client: S3Client,
  s3BucketName: string,
  rootFilePath: string,
  absoluteFilePath: string
) {
  const key = getObjectKeyFromFilePath(rootFilePath, absoluteFilePath);
  const extension = path.extname(key).toLowerCase();
  const cacheControl = getCacheControlForExtension(extension);
  const contentType = getContentTypeForExtension(extension);
  const localETag = getETag(absoluteFilePath);
  const metadata = await getObjectMetadata(client, s3BucketName, key);

  const shouldUploadFile =
    !metadata ||
    metadata.CacheControl !== cacheControl ||
    metadata.ContentType !== contentType ||
    metadata.ETag !== localETag;

  if (shouldUploadFile) {
    await uploadFile(
      client,
      s3BucketName,
      key,
      absoluteFilePath,
      cacheControl,
      contentType
    );
  }
  return key;
}

const trailingSlashRegex = /\/$/;

async function getFilesFromOutDir(outDir: string): Promise<string[]> {
  const sanitisedOutDir = outDir.replace(trailingSlashRegex, '');
  const patterns = [`${sanitisedOutDir}/**`];
  const globber = await glob.create(patterns.join('\n'), {
    matchDirectories: false,
  });
  return globber.glob();
}

export async function syncRootFilesToS3(
  s3BucketName: string,
  outDir: string,
  region: string
): Promise<void> {
  const client = new S3Client({
    region,
  });
  const files = await getFilesFromOutDir(outDir);
  const absoluteFilePath = path.resolve(outDir);
  for (const file of files) {
    await maybeUploadFile(client, s3BucketName, absoluteFilePath, file);
  }
}
