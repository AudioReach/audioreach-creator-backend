/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EditOptions} from '../../edit-options.js';
import type {
  SpfModule,
  SpfModuleBase,
} from '../../../../../domain/entities/usecase-data/module/spf-module.js';
import type {DataPort} from '../../../../../domain/entities/usecase-data/node/entities/data-port.js';
import type {ControlPort} from '../../../../../domain/entities/usecase-data/node/entities/control-port.js';
import type {KvData} from '../../../../../domain/entities/common/entities/kv-data.js';

export type {SpfModuleBase} from '../../../../../domain/entities/usecase-data/module/spf-module.js';

export interface ExistingPayloadRow {
  systemId: number; // PK of CkvParameterPayload — matches param.systemId from client
  parameterSystemId: number; // FK → SpfModuleParameterDefinition.systemId
}

export interface CkvPayloadUpdate {
  payloadSystemId: number; // PK of CkvParameterPayload — used as targetSystemId in edit_actions
  payload: Uint8Array;
}

/**
 * Projection of an SpfModule used for container-level operations:
 * capability validation and heap cascade.
 */
export interface ModuleForContainer {
  /** PK of SpfModule — used as aggregateId when staging heap cascade writes. */
  moduleSystemId: number;
  /** Container type IDs supported by this module's definition — used for capability intersection. */
  containerTypeIds: number[];
  /** Human-readable display name from SpfModuleDefinition — used in capability mismatch error messages. */
  displayName: string;
}

/**
 * Write-side port for the SpfModule aggregate.
 *
 * findModuleForPatch must load intents for each control port so the handler
 * can compute intent availability without an extra query.
 */
export interface ModuleRepository {
  /**
   * Returns SpfModule with dataPorts and controlPorts (including intentIds)
   * loaded with session overlay applied. Returns null when not found.
   * Overlay-aware — sequential PATCHes in the same session read each other's staged changes.
   */
  findModuleForPatch(
    systemId: number,
    fileSystemId: number,
  ): Promise<SpfModule | null>;

  renameModule(
    moduleSystemId: number,
    alias: string,
    options?: EditOptions,
  ): Promise<void>;
  changeContainer(
    moduleSystemId: number,
    containerSystemId: number,
    options?: EditOptions,
  ): Promise<void>;
  addDataPort(
    port: DataPort,
    moduleSystemId: number,
    options?: EditOptions,
  ): Promise<void>;
  removeDataPort(
    portSystemId: number,
    moduleSystemId: number,
    options?: EditOptions,
  ): Promise<void>;
  addControlPort(
    port: ControlPort,
    moduleSystemId: number,
    options?: EditOptions,
  ): Promise<void>;
  removeControlPort(
    portSystemId: number,
    moduleSystemId: number,
    options?: EditOptions,
  ): Promise<void>;
  createModule(module: SpfModule, options?: EditOptions): Promise<void>;

  /**
   * Stages CREATE rows for a CKV and all its CkvParameterPayload children atomically.
   * A CKV cannot exist without its parameter payloads — they are one aggregate.
   *
   * For the zero-CKV added at module creation time: kvData.valueDefinitionSystemIds
   * is empty (no key dimensions) and all parameter payloads carry default blobs.
   *
   * TODO(add-module-calibration-defaults): implement adapter
   * See: docs/edit-crud/design/add-module-calibration-defaults-design.md §6
   */
  createCkv(
    kvData: KvData,
    moduleSystemId: number,
    options?: EditOptions,
  ): Promise<void>;

  getSpfModuleForValidation(
    spfModuleSystemId: number,
    fileSystemId: number,
  ): Promise<SpfModuleBase | null>;

  ckvExists(spfModuleSystemId: number, ckvSystemId: number): Promise<boolean>;

  getExistingCkvPayloads(
    spfModuleSystemId: number,
    ckvSystemId: number,
  ): Promise<ExistingPayloadRow[]>;

  setCkvCalData(
    spfModuleSystemId: number,
    ckvSystemId: number,
    payloadUpdates: CkvPayloadUpdate[],
    uiPersistence?: string,
  ): Promise<void>;

  /**
   * Returns all non-deleted modules belonging to a container.
   * Overlay-aware: excludes pending DELETEs, includes pending CREATEs.
   * Used by capability validation and heap cascade in UpdateContainerPropertyHandler.
   */
  getModulesByContainerId(
    containerSystemId: number,
    fileSystemId: number,
  ): Promise<ModuleForContainer[]>;

  /**
   * Stages a heapId update on a SpfModule row via edit_actions.
   * targetTable = SpfModule; aggregateId = moduleSystemId.
   * All cascade writes for one API call share the same groupId (stamped by CommandBus).
   */
  updateHeapId(moduleSystemId: number, heapId: number): Promise<void>;
}
