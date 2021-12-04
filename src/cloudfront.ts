import { info } from '@actions/core';
import path from 'node:path';

export async function invalidateCloudFrontCache(keys: string[]): Promise<void> {
  const htmlKeys = keys.filter((key) => {
    const ext = path.extname(key).toLowerCase();
    return ext === '.html';
  });
}
