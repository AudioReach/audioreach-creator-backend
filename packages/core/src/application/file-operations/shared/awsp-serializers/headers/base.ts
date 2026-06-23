/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {WorkspaceFileVersion} from '../version.js';

/** Fields shared by all AWSP header versions. Extend per version. */
export interface AwspFileHeaderBase {
  version: WorkspaceFileVersion;
  acdbFilePath: string;
  eacFilePath: string;
  workspaceFileInfo: {
    type: string;
    isZipped: boolean;
    isEncrypted: boolean;
  };
}
