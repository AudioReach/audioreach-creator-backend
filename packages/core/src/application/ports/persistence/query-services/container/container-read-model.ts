/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface ContainerReadModel {
  readonly systemId: number;
  readonly containerId: number;
  /** FK to container_types.system_id. Null until ContainerBuilder populates it from ACDB. */
  readonly containerTypeSystemId: number | null;
  /** Human-readable name from container_types. Null when containerTypeSystemId is not yet set. */
  readonly containerTypeName: string | null;
}
