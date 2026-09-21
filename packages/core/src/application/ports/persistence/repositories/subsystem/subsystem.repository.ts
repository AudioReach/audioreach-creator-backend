/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {PortIoType} from '../../../../../domain/entities/common/enums/port-io-type.js';

/** Identifies a subsystem control port without losing its aggregate owner. */
export interface SubsystemControlPortRef {
  subsystemSystemId: number;
  controlPortSystemId: number;
}

import type {EditOptions} from '../../edit-options.js';
import type {ControlPort} from '../../../../../domain/entities/usecase-data/node/entities/control-port.js';
import type {DataPort} from '../../../../../domain/entities/usecase-data/node/entities/data-port.js';
import type {Subsystem} from '../../../../../domain/entities/usecase-data/subsystem/subsystem.js';
import type {NodeType} from '../../../../../domain/entities/usecase-data/node/node.js';

export interface SubsystemSummary {
  readonly systemId: number;
  readonly naturalId: number;
  readonly name: string;
  readonly parentSystemId: number | null;
  readonly moduleSystemIds: readonly number[];
  readonly subsystemSystemIds: readonly number[];
}

export interface SubsystemKey {
  readonly systemId: number;
  readonly keyId: number;
  readonly name: string;
}

export type SubsystemNodeTopology = {
  systemId: number;
  parentSystemId: number | null;
  type: NodeType;
};

export interface SubsystemRepository {
  getSubsystems(fileSystemId: number): Promise<SubsystemSummary[]>;
  getSubsystem(
    systemId: number,
    fileSystemId: number,
  ): Promise<Subsystem | null>;
  getKeysAssignedToSubsystem(
    keySystemIds: readonly number[],
    fileSystemId: number,
  ): Promise<SubsystemKey[]>;
  subsystemExists(systemId: number, fileSystemId: number): Promise<boolean>;
  hasSubsystems(fileSystemId: number): Promise<boolean>;

  clearControlPortIntents(
    ports: SubsystemControlPortRef[],
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<void>;

  /** Returns session-aware parent relationships and types for all file nodes. */
  getAllNodesWithParents(
    fileSystemId: number,
  ): Promise<SubsystemNodeTopology[]>;

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

  createSubsystem(subsystem: Subsystem, options?: EditOptions): Promise<void>;
  deleteSubsystem(systemId: number, options?: EditOptions): Promise<void>;
  renameSubsystem(
    systemId: number,
    name: string,
    options?: EditOptions,
  ): Promise<void>;
  setFilteredKeys(
    systemId: number,
    keySystemIds: number[],
    options?: EditOptions,
  ): Promise<void>;
  addDataPort(
    port: DataPort,
    subsystemSystemId: number,
    options?: EditOptions,
  ): Promise<void>;
  removeDataPort(
    portSystemId: number,
    subsystemSystemId: number,
    options?: EditOptions,
  ): Promise<void>;
  addControlPort(
    port: ControlPort,
    subsystemSystemId: number,
    options?: EditOptions,
  ): Promise<void>;
  removeControlPort(
    portSystemId: number,
    subsystemSystemId: number,
    options?: EditOptions,
  ): Promise<void>;
  updateParentId(
    subsystemSystemId: number,
    parentSubsystemSystemId: number | null,
    options?: EditOptions,
  ): Promise<void>;
}
