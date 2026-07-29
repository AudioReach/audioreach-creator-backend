/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface SubsystemRepository {
  subsystemExists(systemId: number, fileSystemId: number): Promise<boolean>;
}
