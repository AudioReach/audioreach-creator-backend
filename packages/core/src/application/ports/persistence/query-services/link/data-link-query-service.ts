/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataLink} from '../../../../../domain/entities/usecase-data/links/data-link.js';
import type {BatchRead} from '../../batch-read.js';
import type {ENTITY_TYPE} from '../../../../../shared/entity-type.js';
import type {IdentifiedEntityRef} from '../../../../../domain/identity/entity-identity.js';
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
   * Returns data links whose source and destination subgraphs both belong
   * to the combined subgraph membership of the given usecases.
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
   *
   * TODO: split into `findByModulePort` and `findBySubgraph`; see
   * `subgraph-peer-link-filter.ts` for why it is one method today.
   */
  findSubgraphPeerLinks(
    fileSystemId: number,
    filter: SubgraphPeerLinkFilter,
  ): Promise<DataLinkWithUsecaseIdsReadModel[]>;

  /**
   * Returns the subsystem segments of data links whose source and destination
   * subgraphs both belong to the combined membership of the given usecases.
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
   * Returns the data links between two different subgraphs that are not
   * INTER_USECASE: NORMAL and EC data links. Links inside one subgraph are
   * not returned. Pass `{readMode: READ_MODE.Committed}` to read the
   * committed state without the session's edits.
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
   * Returns the subsystem segments, resolved or not, with a source or
   * destination port in `portSystemIds`.
   */
  findSegmentsByPorts(
    fileSystemId: number,
    portSystemIds: readonly number[],
  ): Promise<SubsystemDataLinkReadModel[]>;

  /**
   * Returns the data link from the source port to the destination port, or
   * null. `isDeleted` is true when the session deleted it.
   */
  findByPortPair(
    fileSystemId: number,
    sourcePortSystemId: number,
    destinationPortSystemId: number,
  ): Promise<{systemId: number; isDeleted: boolean} | null>;

  /**
   * The source and destination endpoints (node and port) of each requested
   * data link, in request order. Subsystem segment IDs and missing IDs are
   * `NOT_FOUND`; a link whose node, module definition, or port is missing
   * is `UNRESOLVED_REFERENCE`.
   * An entity deleted in the session is read from committed data, so it
   * is named as the user last saw it; this is not an existence check.
   */
  findDataLinkIdentities(
    fileSystemId: number,
    systemIds: readonly number[],
  ): Promise<
    BatchRead<
      IdentifiedEntityRef<typeof ENTITY_TYPE.DataLink>,
      typeof ENTITY_TYPE.DataLink
    >
  >;
}
