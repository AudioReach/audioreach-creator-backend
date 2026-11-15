/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataLink} from '../../../../../domain/entities/usecase-data/links/data-link.js';
import type {BatchRead} from '../../batch-read.js';
import type {ENTITY_TYPE} from '../../../../../shared/entity-type.js';
import type {ReadOptions} from '../../repositories/shared/read-options.js';
import type {SessionChanged} from '../../repositories/shared/session-changed.js';
import type {DataLinkReadModel} from './data-link-read-model.js';
import type {SubgraphPeerLinkFilter} from '../shared/subgraph-peer-link-filter.js';
import type {DataLinkWithUsecaseIdsReadModel} from './data-link-with-usecase-ids-read-model.js';
import type {SubsystemDataLinkReadModel} from '../usecase/query-models/subsystem-data-link-read-model.js';

/**
 * Reads of data links and their subsystem segments, with the session
 * overlay applied unless stated otherwise. `DataLinkRepository` extends it,
 * so commands use the same reads inside their unit of work.
 */
export interface DataLinkQueryService {
  /**
   * Returns the data links with an endpoint in a subgraph of the given
   * usecases, including links to subgraphs outside them.
   */
  findByUsecaseIds(
    fileSystemId: number,
    usecaseSystemIds: readonly number[],
  ): Promise<DataLinkReadModel[]>;

  /**
   * Returns the data links with an endpoint in one of the given subgraphs,
   * including links to other subgraphs.
   */
  findBySubgraphIds(
    fileSystemId: number,
    subgraphSystemIds: readonly number[],
  ): Promise<DataLinkReadModel[]>;

  /**
   * Returns the links between subgraphs that match the filter, each with
   * the usecases that contain its source/destination subgraph pair.
   */
  findSubgraphPeerLinks(
    fileSystemId: number,
    filter: SubgraphPeerLinkFilter,
  ): Promise<DataLinkWithUsecaseIdsReadModel[]>;

  /**
   * Returns the subsystem segments of the data links that have an endpoint
   * in a subgraph of the given usecases.
   */
  findSegmentsByUsecaseIds(
    fileSystemId: number,
    usecaseSystemIds: readonly number[],
  ): Promise<SubsystemDataLinkReadModel[]>;

  /**
   * Returns the canonical data link, with its subsystem segments, of each
   * requested ID, which may be a data link or one of its segments. Each
   * link appears once, however many of its IDs were requested. An unknown
   * ID, or a segment with no canonical link, is `NOT_FOUND`.
   */
  findCanonicalLinks(
    fileSystemId: number,
    systemIds: readonly number[],
  ): Promise<BatchRead<DataLink, typeof ENTITY_TYPE.DataLink>>;

  /**
   * Returns every NORMAL data link in the file. Pass
   * `{readMode: READ_MODE.Committed}` to read the committed state without
   * the session's edits.
   */
  findIntraUcLinks(
    fileSystemId: number,
    options?: ReadOptions,
  ): Promise<DataLink[]>;

  /**
   * Returns the data links added or deleted in the current session. Updates
   * are not included.
   */
  findChangedInSession(fileSystemId: number): Promise<SessionChanged<DataLink>>;

  /**
   * Returns the data links and subsystem segments with a source or
   * destination port in `portSystemIds`, once per matching port.
   * `linkSystemId` is the link or the segment.
   */
  findLinkIdsByPorts(
    fileSystemId: number,
    portSystemIds: readonly number[],
  ): Promise<{linkSystemId: number; portSystemId: number}[]>;

  /**
   * Returns the data link from the source port to the destination port, or
   * null. `isDeleted` is true when the session deleted it.
   */
  findByPortPair(
    fileSystemId: number,
    sourcePortSystemId: number,
    destinationPortSystemId: number,
  ): Promise<{systemId: number; isDeleted: boolean} | null>;
}
