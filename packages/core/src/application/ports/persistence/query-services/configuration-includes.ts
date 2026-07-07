/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Controls the scope of data loaded by a query service method.
 * Reused across all query services.
 *
 * Ordered scale, not independent flags — FullDetails always includes
 * everything Summary loads, plus additional fields on top.
 *
 * Summary:     identity fields (systemId, domain id, name, description)
 * FullDetails: all fields on top of Summary
 */
export const CONFIGURATION_INCLUDES = {
  Summary: 'SUMMARY',
  FullDetails: 'FULL_DETAILS',
} as const;

export type ConfigurationIncludes =
  (typeof CONFIGURATION_INCLUDES)[keyof typeof CONFIGURATION_INCLUDES];
