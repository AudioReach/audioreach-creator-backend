/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  ACDBVersionInfo,
  CodecInfo,
} from '../../../../domain/entities/common/entities/header.entity.js';
import {BaseChunk} from './base-chunk.js';
import {PARSED_CHUNK_TYPES} from '../constants/chunk-types.js';

/**
 * Header chunk containing ACDB file metadata and version information.
 * Dependencies: None (this is the root chunk)
 */
export class HeaderChunk extends BaseChunk {
  readonly chunkType = PARSED_CHUNK_TYPES.HEADER;

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
