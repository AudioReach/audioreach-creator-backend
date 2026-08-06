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
}
