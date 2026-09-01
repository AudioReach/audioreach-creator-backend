/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EditOptions} from '../../edit-options.js';
import type {Subgraph} from '../../../../../domain/entities/usecase-data/subgraph/subgraph.js';
import type {ParameterDefinitionBase} from '../module/module-definition.repository.js';

export interface VcpmPayloadRow {
  systemId: number;
  vcpmParameterSystemId: number;
}

export interface VcpmPayloadUpdate {
  payloadSystemId: number;
  payload: Uint8Array;
}

export interface SubgraphRepository {
  subgraphExists(systemId: number, fileSystemId: number): Promise<boolean>;

  /**
   * Stages CREATE rows for the Subgraph aggregate root and all its
   * SubgraphPropertyData children.
   * All rows share the ambient groupId so the whole creation is one undo unit.
   */
  createSubgraph(subgraph: Subgraph, options?: EditOptions): Promise<void>;

  getVcpmInstanceSystemId(
    subgraphSystemId: number,
    vcpmDefinitionSystemId: number,
  ): Promise<number | null>;

  vcpmCkvExists(
    instanceSystemId: number,
    valueSystemIds: number[],
  ): Promise<boolean>;

  vcpmCkvExistsBySystemId(
    ckvSystemId: number,
    subgraphSystemId: number,
  ): Promise<boolean>;

  createVcpmCkv(
    subgraphSystemId: number,
    instanceSystemId: number,
    valueSystemIds: number[],
    params: ParameterDefinitionBase[],
  ): Promise<number>;

  deleteVcpmCkv(subgraphSystemId: number, ckvSystemId: number): Promise<void>;

  getVcpmCkvPayloads(
    ckvSystemId: number,
    subgraphSystemId: number,
  ): Promise<VcpmPayloadRow[]>;

  updateVcpmCalData(
    subgraphSystemId: number,
    ckvSystemId: number,
    updates: VcpmPayloadUpdate[],
  ): Promise<void>;
}
