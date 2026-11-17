/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ControlLink} from '../../../../../domain/entities/usecase-data/links/control-link.js';
import type {BatchRead} from '../../batch-read.js';
import type {ENTITY_TYPE} from '../../../../../shared/entity-type.js';
import type {IdentifiedEntityRef} from '../../../../../domain/identity/entity-identity.js';
import type {SessionChanged} from '../../repositories/shared/session-changed.js';
import type {ControlLinkReadModel} from './control-link-read-model.js';
import type {SubgraphPeerLinkFilter} from '../shared/subgraph-peer-link-filter.js';
import type {ControlLinkWithUsecaseIdsReadModel} from './control-link-with-usecase-ids-read-model.js';

/**
 * Reads of control links and their subsystem segments, with the session
 * overlay applied. `ControlLinkRepository` extends it, so commands use the
 * same reads inside their unit of work.
 */
export interface ControlLinkQueryService {
  /**
   * Returns control links whose source and destination subgraphs both belong
   * to the combined subgraph membership of the given usecases.
   */
  findByUsecaseIds(
    fileSystemId: number,
    usecaseSystemIds: readonly number[],
  ): Promise<ControlLinkReadModel[]>;

  /**
   * Returns the control links with an endpoint in one of the given subgraphs,
   * including links to other subgraphs.
   */
  findBySubgraphIds(
    fileSystemId: number,
    subgraphSystemIds: readonly number[],
  ): Promise<ControlLinkReadModel[]>;

  /**
   * Returns the links between subgraphs that match the filter, each with
   * the usecases that contain its subgraph pair.
   *
   * TODO: split into `findByModulePort` and `findBySubgraph`; see
   * `subgraph-peer-link-filter.ts` for why it is one method today.
   */
  findSubgraphPeerLinks(
    fileSystemId: number,
    filter: SubgraphPeerLinkFilter,
  ): Promise<ControlLinkWithUsecaseIdsReadModel[]>;

  /**
   * Returns the control links with the given system IDs, each with its
   * subsystem segments. A segment ID is `NOT_FOUND`.
   */
  findControlLinks(
    fileSystemId: number,
    systemIds: readonly number[],
  ): Promise<BatchRead<ControlLink, typeof ENTITY_TYPE.ControlLink>>;

  /**
   * Returns the subsystem segments of the given links. Each ID is either a
   * control link, matching its segments, or a segment that has no control
   * link yet, matching itself. A segment takes its heap ID from its control
   * link, or 1 when it has none.
   */
  findControlLinkSegments(
    fileSystemId: number,
    linkSystemIds: readonly number[],
  ): Promise<ControlLinkReadModel[]>;

  /**
   * Returns the subsystem segments of control links whose source and destination
   * subgraphs both belong to the combined membership of the given usecases.
   */
  findSegmentsByUsecaseIds(
    fileSystemId: number,
    usecaseSystemIds: readonly number[],
  ): Promise<ControlLinkReadModel[]>;

  /**
   * Returns the canonical control link, with its subsystem segments, of
   * each requested ID, which may be a control link or one of its segments. Each link appears
   * once, however many of its IDs were requested. An unknown ID, or a
   * segment with no canonical link, is `NOT_FOUND`.
   */
  findCanonicalLinks(
    fileSystemId: number,
    systemIds: readonly number[],
  ): Promise<BatchRead<ControlLink, typeof ENTITY_TYPE.ControlLink>>;

  /**
   * Returns the control links between two different subgraphs that are not
   * INTER_USECASE: NORMAL control links. Links inside one subgraph are not
   * returned.
   */
  findIntraUcLinks(fileSystemId: number): Promise<ControlLink[]>;

  /**
   * Returns the control links added or deleted in the current session.
   * Updates are not included.
   */
  findChangedInSession(
    fileSystemId: number,
  ): Promise<SessionChanged<ControlLink>>;

  /**
   * Returns the control links and subsystem segments with an endpoint port
   * in `portSystemIds`, once per matching port. `linkSystemId` is the link
   * or the segment.
   */
  findLinkIdsByPorts(
    fileSystemId: number,
    portSystemIds: readonly number[],
  ): Promise<{linkSystemId: number; portSystemId: number}[]>;

  /**
   * Returns the control link with port A and port B, or null. Pass the
   * ports in canonical order (port A < port B). `isDeleted` is true when
   * the session deleted it.
   */
  findByPortPair(
    fileSystemId: number,
    portASystemId: number,
    portBSystemId: number,
  ): Promise<{systemId: number; isDeleted: boolean} | null>;

  /** Returns the intents allocated on a control port. */
  findAllocatedIntents(
    fileSystemId: number,
    controlPortSystemId: number,
  ): Promise<{intentSystemId: number; intentId: number}[]>;

  /**
   * The two endpoints (node and port) of each requested control link, in
   * request order. Subsystem segment IDs and missing IDs are `NOT_FOUND`;
   * a link whose node, module definition, or port is missing is
   * `UNRESOLVED_REFERENCE`.
   */
  findControlLinkIdentities(
    fileSystemId: number,
    systemIds: readonly number[],
  ): Promise<
    BatchRead<
      IdentifiedEntityRef<typeof ENTITY_TYPE.ControlLink>,
      typeof ENTITY_TYPE.ControlLink
    >
  >;
}
