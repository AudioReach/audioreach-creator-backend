/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Raw binary chunk type constants for ACDB files.
 * These represent the actual chunk types as they appear in the binary file.
 * Centralized string constants to avoid magic strings and provide type safety.
 */
export const ACDB_RAW_CHUNK_TYPES = {
  HEADER: 'HEAD',
  DATAPOOL: 'POOL',
  GKV_TABLE: 'GKVT',
  GKV_LUT: 'GKVL',
  SUBGRAPH_CONNECTION_LUT: 'SCLU',
  SUBGRAPH_CONNECTION_DEF: 'SCDE',
  SUBGRAPH_CONNECTION_DOT: 'SCDO',

  // Voice calibration chunks (binary - from file)
  VCPM_CALDATA: 'VCCD',
  VCPM_MASTER_KEY: 'VCMK',
  VCPM_CALIBRATION_KEY_TABLE: 'VCKT',
  VCPM_CALIBRATION_DATA_LUT: 'VCLU',
  VCPM_CALIBRATION_DATA_DEF: 'VCDE',

  // Audio calibration chunks (binary - from file)
  CALIBRATION_SUBGRAPH_LUT: 'CSLU',
  CALIBRATION_KEY_TABLE: 'CAKT',
  CALIBRATION_DATA_LUT: 'CDLU',
  CALIBRATION_DATA_DEF: 'CDDE',
  CALIBRATION_DATA_DOT: 'CDDO',

  // Tag key IDs table (binary - from file)
  MODULE_TAG_KEYIDS_TABLE: 'MTKL',

  // Tag data chunks (binary - from file)
  MODULE_TAG_KEY_TABLE: 'MTKT',
  MODULE_TAG_DATA_LUT: 'MTLU',
  MODULE_TAG_DATA_DEF: 'MTDE',
  MODULE_TAG_DATA_DOT: 'MTDO',

  // Tagged module map chunks (binary - from file)
  TAGGED_MODULES_LUT: 'TMLU',
  TAGGED_MODULES_DEF: 'TMDE',

  // Driver calibration chunks (binary - from file)
  DRIVER_CALIBRATION_LUT: 'GCLU',
  DRIVER_CALIBRATION_KEY_TABLE: 'GCKT',
  DRIVER_CALIBRATION_DATA_TABLE: 'GCDT',
  DRIVER_CALIBRATION_DATA_DEF: 'GCDE',
  DRIVER_CALIBRATION_DATA_DOT: 'GCDO',

  // Module manager and boot-up loading chunks (binary - from file)
  MODULE_MANAGER: 'MODM',
  BOOTUP_LOADING: 'BTUP',
} as const;

/**
 * Union type of all valid raw chunk types from ACDB file
 */
export type AcdbRawChunkType =
  (typeof ACDB_RAW_CHUNK_TYPES)[keyof typeof ACDB_RAW_CHUNK_TYPES];

/**
 * Array of all raw chunk types for iteration
 */
export const ALL_ACDB_RAW_CHUNK_TYPES = Object.values(ACDB_RAW_CHUNK_TYPES);

/**
 * Parsed chunk type constants for ACDB processing.
 * These represent parsed chunks that are available after processing.
 * Includes both:
 * - Parsed file chunks (parsed from binary chunks in the file)
 * - Derived chunks (computed from other parsed chunks, not in binary file)
 */
export const PARSED_CHUNK_TYPES = {
  // Parsed from file chunks
  HEADER: 'HEADER',
  DATAPOOL: 'DATAPOOL',
  USECASE_DATA: 'USECASE_DATA',
  SUBGRAPH_PAIR_DATA: 'SUBGRAPH_PAIR_DATA',
  SUBGRAPH_DATA: 'SUBGRAPH_DATA',
  AUDIO_CALIBRATION_DATA: 'AUDIO_CALIBRATION_DATA',
  VOICE_CALIBRATION_DATA: 'VOICE_CALIBRATION_DATA',
  TAG_KEYS: 'TAG_KEYS',
  TAG_DATA: 'TAG_DATA',
  TAGGED_MODULE_MAP: 'TAGGED_MODULE_MAP',
  DRIVER_CALIBRATION_DATA: 'DRIVER_CALIBRATION_DATA',
  MODULE_MANAGER: 'MODULE_MANAGER',
  BOOTUP_LOADING: 'BOOTUP_LOADING',
} as const;

/**
 * Union type of all valid parsed chunk types
 */
export type ParsedChunkType =
  (typeof PARSED_CHUNK_TYPES)[keyof typeof PARSED_CHUNK_TYPES];

/**
 * Array of all parsed chunk types for iteration
 */
export const ALL_PARSED_CHUNK_TYPES = Object.values(PARSED_CHUNK_TYPES);
