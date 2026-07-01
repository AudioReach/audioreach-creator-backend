/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Controls the scope of data loaded by a query service method.
 * Reused across all query services.
 *
 * summary:     always loaded — identity fields (systemId, domain id, name, description)
 * fullDetails: optional — load all fields on top of summary
 */
export interface ConfigurationIncludes {
  summary: boolean;
  fullDetails?: boolean;
}
