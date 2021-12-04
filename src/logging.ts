import { info, warning } from '@actions/core';
import { StackStatus } from '@aws-sdk/client-cloudformation';

let statusLogs: {
  [key: string]: boolean;
} = {};

export function logStatus(status: string): void {
  if (!(status in statusLogs)) {
    statusLogs[status] = true;
    if (status === String(StackStatus.ROLLBACK_IN_PROGRESS)) {
      warning(
        `${StackStatus.ROLLBACK_IN_PROGRESS} detected! **Check the CloudFormation events in the AWS Console for more information.** ` +
          `${StackStatus.ROLLBACK_IN_PROGRESS} can take a while to complete. ` +
          `You can manually delete the CloudFormation stack in the AWS Console or just wait until this process completes...`
      );
    }
    info(status);
  }
}

export function resetStatusLogs(): void {
  statusLogs = {};
}
