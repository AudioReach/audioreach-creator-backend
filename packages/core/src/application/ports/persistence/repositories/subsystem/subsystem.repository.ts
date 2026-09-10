/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

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
  readonly parentId?: number;
  readonly subgraphSystemIds: readonly number[];
}

export interface SubsystemKeyDefinition {
  readonly systemId: number;
  readonly keyId: number;
  readonly name: string;
}

export type SubsystemNodeTopology = {
  systemId: number;
  parentId: number | null;
  type: NodeType;
};

export interface SubsystemRepository {
  findSubsystems(fileSystemId: number): Promise<SubsystemSummary[]>;
  findNodeTopology(fileSystemId: number): Promise<SubsystemNodeTopology[]>;
  findSubsystemForPatch(
    systemId: number,
    fileSystemId: number,
  ): Promise<Subsystem | null>;
  findKeyDefinitionsByIds(
    keySystemIds: readonly number[],
    fileSystemId: number,
  ): Promise<SubsystemKeyDefinition[]>;
  subsystemExists(systemId: number, fileSystemId: number): Promise<boolean>;
  hasSubsystems(fileSystemId: number): Promise<boolean>;

  clearControlPortIntents(
    ports: SubsystemControlPortRef[],
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<void>;

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
