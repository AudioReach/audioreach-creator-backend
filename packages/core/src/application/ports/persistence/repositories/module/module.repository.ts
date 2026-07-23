/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EditOptions} from '../../edit-options.js';
import type {SpfModule} from '../../../../../domain/entities/usecase-data/module/spf-module.js';
import type {DataPort} from '../../../../../domain/entities/usecase-data/node/entities/data-port.js';
import type {ControlPort} from '../../../../../domain/entities/usecase-data/node/entities/control-port.js';

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
}
