/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {AcknowledgeDataLossHandler} from '../../../../src/application/validation/commands/acknowledge-data-loss.handler.js';
import {AcknowledgeDataLossCommand} from '../../../../src/application/validation/commands/acknowledge-data-loss.command.js';
import {
  FILE_OPEN_STATUS,
  type FileOpenStatus,
} from '../../../../src/domain/entities/usecase-data/project/arc-db-file.js';
import type {ValidationIssue} from '../../../../src/domain/validation/issue.js';

describe('AcknowledgeDataLossHandler', () => {
  it('calls updateFileStatus with READY and empty issues', async () => {
    let capturedFileSystemId: number | undefined;
    let capturedOpenStatus: FileOpenStatus | undefined;
    let capturedIssues: ValidationIssue[] | undefined;

    const mockUow = {
      getProjectRepository: () => ({
        updateFileStatus: async (
          fileSystemId: number,
          openStatus: FileOpenStatus,
          issues: ValidationIssue[],
        ) => {
          capturedFileSystemId = fileSystemId;
          capturedOpenStatus = openStatus;
          capturedIssues = issues;
        },
      }),
    } as any;

    const handler = new AcknowledgeDataLossHandler(mockUow);
    await handler.handle(new AcknowledgeDataLossCommand(42));

    expect(capturedFileSystemId).toBe(42);
    expect(capturedOpenStatus).toBe(FILE_OPEN_STATUS.Ready);
    expect(capturedIssues).toEqual([]);
  });
});
