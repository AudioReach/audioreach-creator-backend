/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {PortIoType} from '../../../../../domain/entities/common/enums/port-io-type.js';

export interface SubsystemRepository {
  subsystemExists(systemId: number, fileSystemId: number): Promise<boolean>;

  /**
   * Returns a map of all node systemIds → parentId (null if top-level) for
   * the given file. Covers both subsystem and module nodes.
   */
  getAllNodesWithParents(
    fileSystemId: number,
  ): Promise<Map<number, number | null>>;

  /**
   * Returns the portIoType of the DataPort with the given systemId, applying
   * the session overlay. Returns null if not found.
   */
  getPortIoType(
    portSystemId: number,
    fileSystemId: number,
  ): Promise<PortIoType | null>;

  /**
   * Returns true if portSystemId is the source port of any non-deleted SLS
   * in the session (base table only — overlay awareness deferred).
   */
  isPortOccupiedAsSource(
    portSystemId: number,
    fileSystemId: number,
  ): Promise<boolean>;

  /**
   * Returns true if portSystemId is the dest port of any non-deleted SLS
   * in the session (base table only — overlay awareness deferred).
   */
  isPortOccupiedAsDest(
    portSystemId: number,
    fileSystemId: number,
  ): Promise<boolean>;

  /**
   * Returns true if a DataPort with the given systemId exists in the file
   * (session overlay + base table). Used to distinguish 404 (port missing)
   * from 422 (port belongs to wrong module).
   */
  portExists(portSystemId: number, fileSystemId: number): Promise<boolean>;
}
