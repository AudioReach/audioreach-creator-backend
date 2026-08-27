/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EditOptions} from '../../edit-options.js';

/** Identifies a subsystem control port without losing its aggregate owner. */
export interface SubsystemControlPortRef {
  subsystemSystemId: number;
  controlPortSystemId: number;
}

export interface SubsystemRepository {
  subsystemExists(systemId: number, fileSystemId: number): Promise<boolean>;
  hasSubsystems(fileSystemId: number): Promise<boolean>;

  clearControlPortIntents(
    ports: SubsystemControlPortRef[],
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<void>;
}
