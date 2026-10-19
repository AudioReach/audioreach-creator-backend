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
import type {PortIoType} from '../../../../../domain/entities/common/enums/port-io-type.js';
import type {ReadOptions} from '../shared/read-options.js';

export type {SpfModuleBase} from '../../../../../domain/entities/usecase-data/module/spf-module.js';

export interface PayloadEntry {
  systemId: number; // PK of CkvParameterPayload — matches param.systemId from client
  parameterSystemId: number; // FK → SpfModuleParameterDefinition.systemId
}

export interface CkvPayloadEntry {
  systemId: number;
  ckvSystemId: number;
  parameterSystemId: number;
}

export interface PayloadUpdate {
  payloadSystemId: number; // PK of CkvParameterPayload — used as targetSystemId in edit_actions
  payload: Uint8Array;
}

export interface CkvSummary {
  systemId: number;
  spfModuleSystemId: number;
  valueDefinitionSystemIds: number[];
}

export interface TagSummary {
  systemId: number;
  spfModuleSystemId: number;
  tagDefinitionSystemId: number;
}

export interface TkvSummary {
  systemId: number;
  moduleTagIdMapSystemId: number;
  valueDefinitionSystemIds: number[];
}

/**
 * Write-side port for the SpfModule aggregate.
 *
 * findModuleForPatch must load intents for each control port so the handler
 * can compute intent availability without an extra query.
 */
export interface ModuleRepository {
  findModuleById(
    systemId: number,
    fileSystemId: number,
  ): Promise<SpfModuleBase | null>;

  findModulesByContainerId(
    containerSystemId: number,
    fileSystemId: number,
  ): Promise<SpfModuleBase[]>;

  findModulesBySubgraphIds(
    subgraphSystemIds: readonly number[],
    fileSystemId: number,
    options?: ReadOptions,
  ): Promise<SpfModuleBase[]>;

  deleteModule(
    moduleSystemId: number,
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<void>;

  getModulesWithStackSizeByContainer(
    containerSystemId: number,
    fileSystemId: number,
  ): Promise<Array<{moduleSystemId: number; stackSize: number}>>;

  /**
   * Returns SpfModule with dataPorts and controlPorts (including intentIds)
   * loaded with session overlay applied. Returns null when not found.
   * Overlay-aware — sequential PATCHes in the same session read each other's staged changes.
   */
  findModuleForPatch(
    systemId: number,
    fileSystemId: number,
  ): Promise<SpfModule | null>;

  /**
   * Lightweight read for link-creation validation. Returns subgraphSystemId
   * and the flat data-port list (systemId + portIoType), session overlay applied.
   * Returns null when the node does not exist OR is not a module-type node —
   * a subsystem ID passed in error also returns null.
   */
  findModulePortsForLink(
    moduleSystemId: number,
    fileSystemId: number,
  ): Promise<{
    subgraphSystemId: number;
    ports: {systemId: number; portIoType: PortIoType}[];
  } | null>;

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
  deleteDataPort(
    portSystemId: number,
    moduleSystemId: number,
    options?: EditOptions,
  ): Promise<void>;
  addControlPort(
    port: ControlPort,
    moduleSystemId: number,
    options?: EditOptions,
  ): Promise<void>;
  deleteControlPort(
    portSystemId: number,
    moduleSystemId: number,
    options?: EditOptions,
  ): Promise<void>;
  updateParentId(
    moduleSystemId: number,
    parentSubsystemSystemId: number | null,
    options?: EditOptions,
  ): Promise<void>;
  createModule(module: SpfModule, options?: EditOptions): Promise<void>;

  /**
   * Stages CREATE rows for a CKV and all its CkvParameterPayload children atomically.
   * A CKV cannot exist without its parameter payloads — they are one aggregate.
   *
   * For the zero-CKV added at module creation time: kvData.valueDefinitionSystemIds
   * is empty (no key dimensions) and all parameter payloads carry default blobs.
   */
  createCkv(
    kvData: KvData,
    moduleSystemId: number,
    options?: EditOptions,
  ): Promise<void>;

  ckvExists(spfModuleSystemId: number, ckvSystemId: number): Promise<boolean>;

  getCkvPayloadEntries(
    spfModuleSystemId: number,
    ckvSystemId: number,
  ): Promise<PayloadEntry[]>;

  setCkvData(
    spfModuleSystemId: number,
    ckvSystemId: number,
    payloadUpdates: PayloadUpdate[],
    uiPersistence?: string,
  ): Promise<void>;

  tagExists(spfModuleSystemId: number, tagSystemId: number): Promise<boolean>;

  tkvExists(tkvSystemId: number): Promise<boolean>;

  getTkvPayloadEntries(
    moduleTagIdMapSystemId: number,
    tkvSystemId: number,
  ): Promise<PayloadEntry[]>;

  setTkvData(
    moduleTagIdMapSystemId: number,
    tkvSystemId: number,
    payloadUpdates: PayloadUpdate[],
    uiPersistence?: string,
  ): Promise<void>;

  // ── CKV management ────────────────────────────────────────────────────────
  getAllCkvsForModule(
    spfModuleSystemId: number,
    fileSystemId: number,
  ): Promise<CkvSummary[]>;
  deleteCkv(
    ckvSystemId: number,
    moduleSystemId: number,
    options?: EditOptions,
  ): Promise<void>;

  // ── Tag management ────────────────────────────────────────────────────────
  getAllTagsForModule(
    spfModuleSystemId: number,
    fileSystemId: number,
  ): Promise<TagSummary[]>;
  getTagBySystemId(
    tagSystemId: number,
    spfModuleSystemId: number,
  ): Promise<TagSummary | null>;
  createTag(
    tagSystemId: number,
    spfModuleSystemId: number,
    tagDefinitionSystemId: number,
    options?: EditOptions,
  ): Promise<void>;
  deleteTag(
    tagSystemId: number,
    moduleSystemId: number,
    options?: EditOptions,
  ): Promise<void>;

  // ── TKV management ────────────────────────────────────────────────────────
  getAllTkvsForTag(
    tagSystemId: number,
    spfModuleSystemId: number,
  ): Promise<TkvSummary[]>;
  getTkvBySystemId(
    tkvSystemId: number,
    spfModuleSystemId: number,
  ): Promise<TkvSummary | null>;
  createTkv(
    kvData: KvData,
    tagSystemId: number,
    moduleSystemId: number,
    options?: EditOptions,
  ): Promise<void>;
  deleteTkv(
    tkvSystemId: number,
    tagSystemId: number,
    options?: EditOptions,
  ): Promise<void>;

  // ── CKV parameter payload management ─────────────────────────────────────
  getCkvPayloadsForParameters(
    spfModuleSystemId: number,
    parameterSystemIds: readonly number[],
  ): Promise<CkvPayloadEntry[]>;
  getCkvPayloadCountByCkvs(
    ckvSystemIds: readonly number[],
    spfModuleSystemId: number,
  ): Promise<Map<number, number>>;
  addParameterToCkv(
    ckvSystemId: number,
    moduleSystemId: number,
    parameterSystemId: number,
    payload: Uint8Array,
    options?: EditOptions,
  ): Promise<void>;
  deleteParameterFromCkv(
    payloadSystemId: number,
    ckvSystemId: number,
    moduleSystemId: number,
    options?: EditOptions,
  ): Promise<void>;

  // ── TKV parameter payload management ─────────────────────────────────────
  addParameterToTkv(
    tkvSystemId: number,
    tagSystemId: number,
    parameterSystemId: number,
    payload: Uint8Array,
    options?: EditOptions,
  ): Promise<void>;
  deleteParameterFromTkv(
    payloadSystemId: number,
    tkvSystemId: number,
    tagSystemId: number,
    options?: EditOptions,
  ): Promise<void>;

  /**
   * Stages a heapId update on a SpfModule row via edit_actions.
   * targetTable = SpfModule; aggregateId = moduleSystemId.
   * The CommandBus-stamped groupId remains command/response correlation only.
   */
  updateHeapId(moduleSystemId: number, heapId: number): Promise<void>;

  /**
   * Deletes CKV calibration data for a module.
   *
   * Zero-CKV creation/reset is business logic owned by core and is not part
   * of this persistence operation.
   */
  DeleteAllCkvData(moduleSystemId: number, fileSystemId: number): Promise<void>;

  /** Deletes TKV/tag calibration data for a module. */
  DeleteAllTkvData(moduleSystemId: number, fileSystemId: number): Promise<void>;
}
