/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ControlLink} from '../../../../../domain/entities/usecase-data/links/control-link.js';
import type {SubsystemControlLink} from '../../../../../domain/entities/usecase-data/links/subsystem-control-link.js';
import type {EditOptions} from '../../edit-options.js';
import type {SessionChanged} from '../shared/session-changed.js';

export interface ControlLinkTopology {
  controlLinks: ControlLink[];
  unresolvedSubsystemControlLinks: SubsystemControlLink[];
}

export interface ControlLinkRepository {
  findLinksConnectedToModule(
    moduleSystemId: number,
    fileSystemId: number,
  ): Promise<ControlLink[]>;

  findUnresolvedSubsystemLinksFromModule(
    moduleSystemId: number,
    fileSystemId: number,
  ): Promise<SubsystemControlLink[]>;

  findAllLinks(fileSystemId: number): Promise<ControlLinkTopology>;

  /**
   * Deletes the canonical link and every currently resolved subsystem segment
   * associated with it. Unresolved segments are intentionally not included.
   */
  deleteAggregate(
    controlLinkSystemId: number,
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<void>;

  createAggregate(
    controlLink: ControlLink,
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<void>;

  /**
   * Returns canonical control links and subsystem segments whose endpoint port
   * is in portSystemIds. linkSystemId identifies the matching link or segment.
   * Empty input short-circuits — returns [] without querying the DB.
   */
  getLinksByPortSystemIds(
    portSystemIds: number[],
    fileSystemId: number,
  ): Promise<{linkSystemId: number; portSystemId: number}[]>;

  /**
   * Returns NORMAL control links between the two peer SGs
   * (`peerASystemId`, `peerBSystemId`) — order-independent. Control links
   * are undirected in the routing domain; the `source_sg` / `dest_sg`
   * columns in the DB are a storage artifact canonicalized by port-ID
   * ordering (`nodeA_port < nodeB_port`), not a domain-meaningful direction.
   *
   * The method matches rows where
   * `(source_sg = peerA AND dest_sg = peerB) OR (source_sg = peerB AND
   * dest_sg = peerA)`. Callers pass the two peer SGs; the adapter handles
   * both stored directions.
   */
  findIntraUcLinksForGivenSgPair(
    fileSystemId: number,
    peerSgASystemId: number,
    peerSgBSystemId: number,
  ): Promise<ControlLink[]>;

  /**
   * Returns ALL NORMAL control links in the file with session
   * overlay applied — session-created links included, session-deleted
   * links excluded.
   *
   * Use case: Phase 10 I5 orphan check (whole-file scan for orphan
   * intra-UC control links after routing writes).
   *
   * Callers filter in memory if they need to exclude specific link IDs.
   *
   * Empty file → [].
   */
  findIntraUcLinksByFile(fileSystemId: number): Promise<ControlLink[]>;

  createSubsystemControlLinks(
    subsystemControlLinks: readonly SubsystemControlLink[],
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<void>;

  /**
   * Deletes the specified effective subsystem segments. When a deleted segment
   * belongs to an existing canonical ControlLink, the canonical link is deleted
   * and surviving segments are detached from it.
   */
  deleteSubsystemControlLinks(
    subsystemControlLinks: readonly SubsystemControlLink[],
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<void>;

  /**
   * Returns ControlLinks added or deleted in the current session — a
   * `SessionChanged<ControlLink>` split. No `source` filter is applied;
   * MANUAL and DIFF_TOOL edit_actions are both included, and routing itself
   * never writes ControlLinks so AUTO_ROUTING is inherently absent from
   * this table.
   *
   * UPDATE-shaped edit_actions are excluded from both buckets — this method
   * surfaces topology-level additions and removals only.
   *
   * Consumer: routing engine graphEdits assembly (addedControlLinks /
   * deletedControlLinks).
   */
  findChangedInSession(
    fileSystemId: number,
  ): Promise<SessionChanged<ControlLink>>;
}
