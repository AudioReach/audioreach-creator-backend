/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Result} from '../../../../shared/result/result.js';
import type {ControlLinkReadModel} from './control-link-read-model.js';
import type {
  ModulePortLinkFilter,
  SubgraphLinkFilter,
  SubgraphPeerLinkFilter,
} from '../shared/subgraph-peer-link-filter.js';
import type {ControlLinkWithUsecaseIdsReadModel} from './control-link-with-usecase-ids-read-model.js';

export interface ControlLinkQueryService {
  /**
   * Returns control links for the given usecase system IDs.
   * Includes NORMAL and INTER_USECASE links.
   * Deduplicated across usecases. Overlay applied.
   */
  findByUsecaseIds(
    usecaseSystemIds: number[],
    fileSystemId: number,
  ): Promise<Result<ControlLinkReadModel[]>>;

  /**
   * Returns NORMAL control links for a single subgraph.
   * Cross-subgraph links are excluded. Overlay applied.
   */
  findBySubgraphId(
    subgraphId: number,
    fileSystemId: number,
  ): Promise<Result<ControlLinkReadModel[]>>;

  /**
   * Returns subgraph-peer links with the effective usecase IDs associated
   * with each source/destination subgraph pair.
   */
  findByModulePort(
    filter: ModulePortLinkFilter,
    fileSystemId: number,
  ): Promise<Result<ControlLinkWithUsecaseIdsReadModel[]>>;

  /**
   * Returns subgraph-peer links with optional peer narrowing and the effective
   * usecase IDs associated with each source/destination subgraph pair.
   */
  findBySubgraph(
    filter: SubgraphLinkFilter,
    fileSystemId: number,
  ): Promise<Result<ControlLinkWithUsecaseIdsReadModel[]>>;

  /** Compatibility method used by the existing shared implementation. */
  findSubgraphPeerLinks(
    filter: SubgraphPeerLinkFilter,
    fileSystemId: number,
  ): Promise<Result<ControlLinkWithUsecaseIdsReadModel[]>>;
}
