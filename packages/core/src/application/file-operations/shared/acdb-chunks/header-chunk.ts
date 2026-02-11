/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseChunk} from './base-chunk.js';
import {CHUNK_TYPES} from '../constants/chunk-types.js';

/**
 * ACDB version information structure
 */
export interface ACDBVersionInfo {
  major: number;
  minor: number;
  revision: number;
  cplInfo: number;
}

/**
 * Codec information structure
 */
export interface CodecInfo {
  codecId: number;
  majorVersion: number;
  minorVersion: number;
}

/**
 * Header chunk containing ACDB file metadata and version information.
 * Dependencies: None (this is the root chunk)
 */
export class HeaderChunk extends BaseChunk {
  readonly chunkType = CHUNK_TYPES.HEADER;

  /** Header version number (determines parsing logic) */
  headerVersion!: number;

  /** ACDB version information */
  version!: ACDBVersionInfo;

  /** List of codec information */
  codecInfos!: CodecInfo[];

  /** File modification date */
  modifiedDate!: number;

  /** OEM information string */
  oemInfo!: string;
}
