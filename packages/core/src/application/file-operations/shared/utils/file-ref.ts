/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export type PathRef = {
  kind: 'path';
  name: string;
  mimeType?: string;
  /**
   * Absolute filesystem path or file:// URI
   */
  uri: string;
};
