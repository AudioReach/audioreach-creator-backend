/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Standardized error codes for the application.
 *
 * Error code format: ERR_XXXX where:
 * - 1xxx: Validation Errors
 * - 2xxx: Parsing Errors
 * - 3xxx: Entity Building Errors
 * - 4xxx: Database Errors
 * - 9xxx: System Errors
 */
export const ERROR_CODES = {
  // Validation Errors (1xxx)
  INVALID_FILE_FORMAT: 'ERR_1001',
  MISSING_REQUIRED_FIELD: 'ERR_1002',
  INVALID_DATA_TYPE: 'ERR_1003',
  INVALID_INPUT: 'ERR_1004',

  // Parsing Errors (2xxx)
  CORRUPTED_BINARY_DATA: 'ERR_2001',
  MISSING_CHUNK: 'ERR_2002',
  INVALID_CHUNK_FORMAT: 'ERR_2003',
  INVALID_ENTITY_DATA: 'ERR_2004',

  // Entity Building Errors (3xxx)
  INVALID_FOREIGN_KEY: 'ERR_3001',
  DUPLICATE_ENTITY: 'ERR_3002',
  MISSING_DEFINITION: 'ERR_3003',

  // Database Errors (4xxx)
  INSERTION_FAILED: 'ERR_4001',
  UNIQUE_CONSTRAINT: 'ERR_4002',
  FOREIGN_KEY_CONSTRAINT: 'ERR_4003',
  ENTITY_NOT_FOUND: 'ERR_4004',

  // System Errors (9xxx)
  INTERNAL_ERROR: 'ERR_9001',
  UNKNOWN_ERROR: 'ERR_9999',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
