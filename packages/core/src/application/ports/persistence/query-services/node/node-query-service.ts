/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataPortReadModel} from '../spf-module/ports/data-port-read-model.js';
import type {ControlPortReadModel} from '../spf-module/ports/control-port-read-model.js';
import type {IntentReadModel} from '../spf-module/ports/intent-read-model.js';
import type {NodeType} from '../../../../../domain/entities/usecase-data/node/node.js';
import type {Result} from '../../../../shared/result/result.js';

export interface NodeInfo {
  systemId: number;
  type: NodeType;
  parentId: number | null;
}

/**
 * Common query service for node — used by any node type (SpfModule, Subsystem, etc.).
 *
 * Provides a unified interface for loading data ports and control ports
 * for a given node. Both are always needed together for graph-view assembly,
 * so combining them into one service avoids separate sub-service wiring.
 */
export interface NodeQueryService {
  getDataPorts(
    nodeSystemId: number,
    fileSystemId: number,
  ): Promise<Result<DataPortReadModel[]>>;

  getControlPorts(
    nodeSystemId: number,
    fileSystemId: number,
  ): Promise<Result<ControlPortReadModel[]>>;

  /**
   * Overlay-aware single-node lookup.
   * Returns null if the node is not found or is soft-deleted.
   */
  findNodeById(
    nodeSystemId: number,
    fileSystemId: number,
  ): Promise<Result<NodeInfo | null>>;

  /**
   * Returns the full nodeSystemId → parentSystemId map for all nodes in the file.
   * Overlay-aware: includes staged CREATEs, excludes staged DELETEs.
   * Used as input to SubsystemBoundaryPathService.
   */
  getAllNodeParentMap(
    fileSystemId: number,
  ): Promise<Result<Map<number, number | null>>>;

  /**
   * Returns allocated intent IDs (after session overlay) keyed by portSystemId.
   * Ports with no intents are absent from the returned map.
   */
  getIntentsByPortSystemIds(
    portSystemIds: number[],
    fileSystemId: number,
  ): Promise<Result<Map<number, IntentReadModel[]>>>;
}
