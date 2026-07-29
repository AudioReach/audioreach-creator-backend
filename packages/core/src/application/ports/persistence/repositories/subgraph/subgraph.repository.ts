/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EditOptions} from '../../edit-options.js';
import type {Subgraph} from '../../../../../domain/entities/usecase-data/subgraph/subgraph.js';

export interface SubgraphRepository {
  subgraphExists(systemId: number, fileSystemId: number): Promise<boolean>;

  /**
   * Stages CREATE rows for the Subgraph aggregate root and all its
   * SubgraphPropertyData children.
   * All rows share the ambient groupId so the whole creation is one undo unit.
   */
  createSubgraph(subgraph: Subgraph, options?: EditOptions): Promise<void>;
}
