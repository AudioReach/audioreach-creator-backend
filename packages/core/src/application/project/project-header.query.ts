/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../shared/base-query.js';

/**
 * Query to retrieve ACDB project header information for a project.
 */
export class ProjectHeaderQuery extends BaseQuery {
  constructor(
    public readonly projectId: string,
    clientId: string,
  ) {
    super(clientId);
  }
}

/**
 * ACDB version information in the header result.
 */
export interface HeaderResultVersion {
  major: number;
  minor: number;
  revision: number;
  cplInfo: number;
}

/**
 * Codec information in the header result.
 */
export interface HeaderResultCodecInfo {
  codecId: number;
  majorVersion: number;
  minorVersion: number;
}

/**
 * Result returned by ProjectHeaderHandler.
 */
export interface ProjectHeaderResult {
  headerVersion: number;
  acdbVersion: HeaderResultVersion;
  acdbVersionString: string;
  codecInfos: HeaderResultCodecInfo[];
  modifiedDate: number;
  modifiedDateFormatted: string;
  oemInfo: string;
}
