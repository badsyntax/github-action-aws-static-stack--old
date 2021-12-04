import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import mime from 'mime-types';
import {
  HeadObjectCommand,
  HeadObjectCommandOutput,
  PutObjectCommand,
  PutObjectCommandOutput,
  S3Client,
} from '@aws-sdk/client-s3';
import glob from '@actions/glob';
import { info } from '@actions/core';

export type S3ObjectPrefix = 'root' | 'preview';

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
  prefix: S3ObjectPrefix | string
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
): Promise<PutObjectCommandOutput> {
  return client.send(
    new PutObjectCommand({
      Bucket: s3BucketName,
      Key: key,
      CacheControl: cacheControl,
      ContentType: contentType,
      Body: fs.createReadStream(absoluteFilePath),
    })
  );
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
  absoluteFilePath: string,
  key: string
): Promise<boolean> {
  const extension = path.extname(key).toLowerCase();
  const cacheControl = getCacheControlForExtension(extension);
  const contentType = getContentTypeForExtension(extension);
  const eTag = getETag(absoluteFilePath);
  const metadata = await getObjectMetadata(client, s3BucketName, key);

  const shouldUploadFile =
    !metadata ||
    metadata.CacheControl !== cacheControl ||
    metadata.ContentType !== contentType ||
    metadata.ETag !== eTag;

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
  return shouldUploadFile;
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

export async function syncFilesToS3(
  client: S3Client,
  s3BucketName: string,
  outDir: string,
  prefix: S3ObjectPrefix | string
): Promise<string[]> {
  const files = await getFilesFromOutDir(outDir);
  const rootFilePath = path.resolve(outDir);
  const uploadedKeys: string[] = [];
  for (const file of files) {
    const key = getObjectKeyFromFilePath(rootFilePath, file, prefix);
    const uploaded = await maybeUploadFile(client, s3BucketName, file, key);
    if (uploaded) {
      info(`Synced ${key}`);
      uploadedKeys.push(key);
    } else {
      info(`Skipped ${key} (no change)`);
    }
  }
  info(`Uploaded ${uploadedKeys.length} files`);
  return uploadedKeys;
}

export async function syncFilesToPreview(
  client: S3Client,
  s3BucketName: string,
  outDir: string
): Promise<string[]> {
  return syncFilesToS3(client, s3BucketName, outDir, 'preview');
}
