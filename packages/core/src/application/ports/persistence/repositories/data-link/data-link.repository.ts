/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataLink} from '../../../../../domain/entities/usecase-data/links/data-link.js';
import type {SubsystemDataLink} from '../../../../../domain/entities/usecase-data/links/subsystem-data-link.js';
import type {EditOptions} from '../../edit-options.js';
import type {PortIoType} from '../../../../../domain/entities/common/enums/port-io-type.js';
import type {LinksForPair, SubgraphPair} from '../shared/links-for-pair.js';
import type {SessionChanged} from '../shared/session-changed.js';

export interface BoundaryPortPayload {
  portSystemId: number;
  nodeSystemId: number;
  nodeParentId: number | null;
  portIoType: PortIoType;
  dataPortId: number;
  fileSystemId: number;
}

export interface DataLinkRepository {
  /**
   * Returns all data links whose src or dst port is in portSystemIds.
   * Empty input short-circuits — returns [] without querying the DB.
   */
  getLinksByPortSystemIds(
    portSystemIds: number[],
    fileSystemId: number,
  ): Promise<{linkSystemId: number; portSystemId: number}[]>;

  /**
   * Returns INTRA_USECASE data links matching the given `pairs` — batched,
   * strictly directional. One `LinksForPair<DataLink>` entry per input pair,
   * in the same order as the input; `entry.links` is empty when no data
   * links match that specific `(source_sg, dest_sg)` direction.
   *
   * Empty `pairs` short-circuits — returns [] without querying the DB.
   *
   * Callers construct `pairs` from their own scope model:
   *   - Selected UCs' pair sets → one directional pair per UC pair.
   */
  findIntraUcLinksForGivenSgPair(
    fileSystemId: number,
    pairs: readonly SubgraphPair[],
  ): Promise<LinksForPair<DataLink>[]>;

  /**
   * Returns ALL INTRA_USECASE data links in the file with session overlay
   * applied — session-created links included, session-deleted links
   * excluded, session-updated links reflect their post-update state.
   *
   * Use cases: Phase 2 bounded-DFS reconstruction (walks the intra-UC
   * adjacency to find a transparent-bridge path through IsMdf SGs); Phases
   * 1, 6, 7 file-wide reads.
   *
   * Callers filter in memory if they need to exclude specific link IDs
   * (e.g., links currently being deleted in the routing session).
   *
   * Empty file → [].
   */
  findIntraUcLinksByFile(fileSystemId: number): Promise<DataLink[]>;

  /**
   * Returns DataLinks added or deleted in the current session — a
   * `SessionChanged<DataLink>` split. No `source` filter is applied; MANUAL
   * and DIFF_TOOL edit_actions are both included, and routing itself never
   * writes DataLinks so AUTO_ROUTING is inherently absent from this table.
   *
   * UPDATE-shaped edit_actions are excluded from both buckets — this method
   * surfaces topology-level additions and removals only.
   *
   * Consumer: routing engine graphEdits assembly (addedDataLinks /
   * deletedDataLinks).
   */
  findChangedInSession(fileSystemId: number): Promise<SessionChanged<DataLink>>;

  /**
   * Writes CREATE edit_action rows for the DataLink, all its SubsystemDataLinks,
   * and all auto-created boundary DataPorts. FK order: Node(s) → DataPort(s) →
   * DataLink → SubsystemDataLink(s). All rows share the groupId from WriteContext.
   */
  createDataLink(
    dataLink: DataLink,
    boundaryPortPayloads: BoundaryPortPayload[],
    options?: EditOptions,
  ): Promise<void>;

  /**
   * Looks up a DataLink by (sourcePortSystemId, destinationPortSystemId) in the
   * session overlay (base data_links table + active edit_actions).
   *
   * Returns null if not found. Returns { systemId, isDeleted: true } if soft-deleted.
   */
  findByPortPair(
    sourcePortSystemId: number,
    destPortSystemId: number,
    fileSystemId: number,
  ): Promise<{
    systemId: number;
    isDeleted: boolean;
    payload: Record<string, unknown>;
  } | null>;

  /**
   * Re-activates a soft-deleted DataLink (FR-DL-07a).
   * Supersedes the existing DELETE edit_action row, then inserts a new CREATE row.
   */
  reactivateDataLink(
    systemId: number,
    aggregateId: number,
    payload: Record<string, unknown>,
    options?: EditOptions,
  ): Promise<void>;

  /**
   * Writes a single unresolved SLS (dataLinkSystemId = null) CREATE row to
   * edit_actions. Used for FR-DLS-11 Branch B where no parent DataLink exists.
   */
  createSubsystemDataLink(
    sls: SubsystemDataLink,
    options?: EditOptions,
  ): Promise<void>;
}
