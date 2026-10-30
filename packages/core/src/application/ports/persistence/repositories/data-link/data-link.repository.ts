/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataLink} from '../../../../../domain/entities/usecase-data/links/data-link.js';
import type {SubsystemDataLink} from '../../../../../domain/entities/usecase-data/links/subsystem-data-link.js';
import type {PortIoType} from '../../../../../domain/entities/common/enums/port-io-type.js';
import type {EditOptions} from '../../edit-options.js';
import type {LinksForPair, SubgraphPair} from '../shared/links-for-pair.js';
import type {SessionChanged} from '../shared/session-changed.js';
import type {ReadOptions} from '../shared/read-options.js';

export interface DataLinkTopology {
  dataLinks: DataLink[];
  unresolvedSubsystemDataLinks: SubsystemDataLink[];
}

/**
 * Result shape for batched Phase-0 request-ID normalization.
 * One entry per requested system ID, in input order.
 */
export interface DataLinkIdResolution {
  requestedSystemId: number;
  /** True when the supplied ID identifies a SubsystemDataLink segment. */
  isSegment: boolean;
  /**
   * Null when the ID is unknown, the segment is unresolved, or its canonical
   * parent is absent from the effective overlay.
   */
  canonicalLink: DataLink | null;
}

export interface BoundaryPortPayload {
  portSystemId: number;
  nodeSystemId: number;
  nodeParentId: number | null;
  portIoType: PortIoType;
  dataPortId: number;
  fileSystemId: number;
}

export interface DataLinkRepository {
  findLinksConnectedToModule(
    moduleSystemId: number,
    fileSystemId: number,
  ): Promise<DataLink[]>;

  findUnresolvedSubsystemLinksFromModule(
    moduleSystemId: number,
    fileSystemId: number,
  ): Promise<SubsystemDataLink[]>;

  findAllLinks(fileSystemId: number): Promise<DataLinkTopology>;

  /**
   * Looks up a canonical DataLink by system ID in the effective session overlay.
   * Returns null when no row matches — either the ID does not exist in this file
   * or it belongs to a subsystem segment rather than a canonical link.
   * Subsystem segment resolution is handled separately (PR 9.5).
   */
  findBySystemId(
    systemId: number,
    fileSystemId: number,
  ): Promise<DataLink | null>;

  /**
   * Resolves canonical DataLink IDs and SubsystemDataLink segment IDs to their
   * effective canonical links. Empty input returns [] without querying.
   */
  findCanonicalLinksByAnySystemIds(
    systemIds: readonly number[],
    fileSystemId: number,
  ): Promise<DataLinkIdResolution[]>;

  /**
   * Resolves existing unresolved subsystem segments by setting their canonical
   * DataLink ID in the current session overlay. Empty input is a no-op.
   */
  resolveSubsystemDataLinks(
    subsystemDataLinks: readonly SubsystemDataLink[],
    dataLinkSystemId: number,
    options?: EditOptions,
  ): Promise<void>;

  /**
   * Deletes the canonical link and every currently resolved subsystem segment
   * associated with it. Unresolved segments are intentionally not included.
   */
  deleteAggregate(
    dataLinkSystemId: number,
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<void>;

  /**
   * Returns canonical data links and subsystem segments whose src or dst port
   * is in portSystemIds. linkSystemId identifies the matching link or segment.
   * Empty input short-circuits — returns [] without querying the DB.
   */
  getLinksByPortSystemIds(
    portSystemIds: number[],
    fileSystemId: number,
  ): Promise<{linkSystemId: number; portSystemId: number}[]>;

  /**
   * Returns NORMAL data links matching the given `pairs` — batched,
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
   * Returns ALL NORMAL data links in the file.
   *
   * Defaults to `ReadMode.Overlay` — session-created links included,
   * session-deleted links excluded, session-updated links reflect
   * their post-update state.
   *
   * Pass `{ readMode: READ_MODE.Committed }` to bypass the session overlay
   * and read base-table state only. Required by the reverse MDF collapse
   * analyzer, which must inspect committed links after session deletions
   * have already been staged.
   *
   * Empty file → [].
   */
  findIntraUcLinksByFile(
    fileSystemId: number,
    options?: ReadOptions,
  ): Promise<DataLink[]>;

  createSubsystemDataLinks(
    subsystemDataLinks: readonly SubsystemDataLink[],
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<void>;

  /**
   * Deletes the specified effective subsystem segments. When a deleted segment
   * belongs to an existing canonical DataLink, the canonical link is deleted
   * and surviving segments are detached from it.
   */
  deleteSubsystemDataLinks(
    subsystemDataLinks: readonly SubsystemDataLink[],
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<void>;

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
   * and all auto-created boundary DataPorts. FK order: DataPort(s) → DataLink →
   * SubsystemDataLink(s). Boundary ports attach to subsystem nodes that already
   * exist, so no Node row is written. The ambient WriteContext groupId is
   * command/response correlation only; it is not persisted on edit actions.
   */
  createDataLink(
    dataLink: DataLink,
    boundaryPortPayloads: BoundaryPortPayload[],
    options?: EditOptions,
  ): Promise<void>;

  /**
   * Writes CREATE edit_action rows for boundary DataPorts and SubsystemDataLink
   * segments only, attaching them to an already-persisted DataLink identified
   * by `dataLinkSystemId`. Used on the soft-delete cancellation path
   * (FR-DL-07a) after `cancelDeleteDataLink()` has restored the baseline
   * DataLink row — this method must not re-issue a CREATE for the DataLink itself.
   */
  attachTraversalEntities(
    dataLinkSystemId: number,
    subsystemDataLinks: SubsystemDataLink[],
    boundaryPortPayloads: BoundaryPortPayload[],
    fileSystemId: number,
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

  /** Cancels the pending DELETE edit_action (FR-DL-07a), restoring the baseline DataLink. */
  cancelDeleteDataLink(systemId: number): Promise<void>;

  /**
   * Writes a single unresolved SLS (dataLinkSystemId = null) CREATE row to
   * edit_actions. Used for FR-DLS-11 Branch B where no parent DataLink exists.
   */
  createSubsystemDataLink(
    sls: SubsystemDataLink,
    options?: EditOptions,
  ): Promise<void>;
}
