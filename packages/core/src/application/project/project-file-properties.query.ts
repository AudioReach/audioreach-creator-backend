/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../shared/base-query.js';

/**
 * Query to retrieve ACDB project file properties for a project.
 */
export class ProjectFilePropertiesQuery extends BaseQuery {
  constructor(
    public readonly projectId: string,
    clientId: string,
  ) {
    super(clientId);
  }
}

/**
 * ACDB version information in the file properties result.
 */
export interface AcdbVersion {
  major: number;
  minor: number;
  revision: number;
  cplInfo: number;
}

/**
 * Codec information in the file properties result.
 */
export interface AcdbCodecInfo {
  codecId: number;
  majorVersion: number;
  minorVersion: number;
}

/**
 * Result returned by ProjectFilePropertiesHandler.
 */
export interface ProjectFilePropertiesResult {
  acdbVersion: AcdbVersion;
  codecInfos: AcdbCodecInfo[];
  modifiedDate: string;
  oemInfo: string;
}
