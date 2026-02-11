/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Constants for definition block names used in JSON definition files
 * These block names correspond to the keys in the JSON definition files
 * that contain arrays of different definition types.
 */
export const DEFINITION_BLOCK_NAMES = {
  KEY_DEFINITIONS: 'keyDefinitions',
  TAG_DEFINITIONS: 'tagDefinitions',
  SPF_PROPERTY_DEFINITIONS: 'spfPropertyDefinitions',
  DRIVER_PROPERTY_DEFINITIONS: 'driverPropertyDefinitions',
  SPF_MODULE_DEFINITIONS: 'spfModuleDefinitions',
  DRIVER_MODULE_DEFINITIONS: 'driverModuleDefinitions',
  SUPPORTED_PROCESSORS: 'supportedProcessors',
  SUPPORTED_CONTAINER_TYPES: 'supportedContainerTypes',
} as const;

/**
 * Constants for file names used in the application
 */
export const FILE_NAMES = {
  DEFINITIONS_JSON: 'definitions.json',
} as const;

/**
 * Constants for file extensions
 */
export const FILE_EXTENSIONS = {
  AWSP: '.awsp',
  ACDB: '.acdb',
} as const;
