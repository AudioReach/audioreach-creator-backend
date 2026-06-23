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
  KEY_DEFINITIONS: 'keys',
  TAG_DEFINITIONS: 'tags',
  SPF_PROPERTY_DEFINITIONS: 'spfProperties',
  DRIVER_PROPERTY_DEFINITIONS: 'driverProperties',
  SPF_MODULE_DEFINITIONS: 'spfModules',
  DRIVER_MODULE_DEFINITIONS: 'driverModules',
  VCPM_MODULE_DEFINITIONS: 'vcpmModuleDefinitions',
  SUPPORTED_PROCESSORS: 'processors',
  SUPPORTED_CONTAINER_TYPES: 'containerTypes',
} as const;

/**
 * Constants for file names used in the application
 */
export const FILE_NAMES = {
  DEFINITIONS_JSON: 'definitions.json',
  CONFIGURATION_JSON: 'configuration.json',
  PERSISTENCE_JSON: 'persistence.json',
  FILEINFO_JSON: 'fileinfo.json',
} as const;

/**
 * Constants for file extensions
 */
export const FILE_EXTENSIONS = {
  AWSP: '.awsp',
  ACDB: '.acdb',
} as const;
