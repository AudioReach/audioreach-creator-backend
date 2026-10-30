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

/**
 * Result shape for batched Phase-0 request-ID normalization.
 * One entry per requested system ID, in input order.
 */
export interface ControlLinkIdResolution {
  requestedSystemId: number;
  /** True when the supplied ID identifies a SubsystemControlLink segment. */
  isSegment: boolean;
  /**
   * Null when the ID is unknown, the segment is unresolved, or its canonical
   * parent is absent from the effective overlay.
   */
  canonicalLink: ControlLink | null;
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
   * Looks up a canonical ControlLink by system ID in the effective session overlay.
   * Returns null when no row matches — either the ID does not exist in this file
   * or it belongs to a subsystem segment rather than a canonical link.
   * Subsystem segment resolution is handled separately (PR 9.5).
   */
  findBySystemId(
    systemId: number,
    fileSystemId: number,
  ): Promise<ControlLink | null>;

  /**
   * Resolves canonical ControlLink IDs and SubsystemControlLink segment IDs to
   * their effective canonical links. Empty input returns [] without querying.
   */
  findCanonicalLinksByAnySystemIds(
    systemIds: readonly number[],
    fileSystemId: number,
  ): Promise<ControlLinkIdResolution[]>;

  /**
   * Resolves existing unresolved subsystem segments by setting their canonical
   * ControlLink ID in the current session overlay. Empty input is a no-op.
   */
  resolveSubsystemControlLinks(
    subsystemControlLinks: readonly SubsystemControlLink[],
    controlLinkSystemId: number,
    options?: EditOptions,
  ): Promise<void>;

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

  /** Returns a non-deleted ControlLink by systemId, or null if not found. */
  findBySystemId(
    systemId: number,
    fileSystemId: number,
  ): Promise<ControlLink | null>;

  /** Returns all non-deleted ControlLinks matching the given systemIds. */
  findBySystemIds(
    systemIds: number[],
    fileSystemId: number,
  ): Promise<ControlLink[]>;

  /**
   * Unified port-pair lookup. Returns `{ systemId, isDeleted, payload }` for
   * any matching link — active or soft-deleted — or `null` if none exists.
   * `payload` carries at minimum `{ linkType }`.
   */
  findByPortPair(
    portASystemId: number,
    portBSystemId: number,
    fileSystemId: number,
  ): Promise<{
    systemId: number;
    isDeleted: boolean;
    payload: Record<string, unknown>;
  } | null>;

  /** Stages a CREATE edit-action for the given ControlLink. */
  createControlLink(link: ControlLink): Promise<void>;

  /** Cancels the pending DELETE edit_action, restoring the baseline ControlLink. */
  cancelDeleteControlLink(systemId: number): Promise<void>;

  /** Stages an UPDATE edit-action to change the heapId on a ControlLink. */
  updateHeapId(systemId: number, heapId: number): Promise<void>;

  /** Stages a CREATE edit-action for a SubsystemControlLink segment. */
  createSubsystemControlLink(scl: SubsystemControlLink): Promise<void>;

  /** Associates unresolved subsystem segments with their canonical link. */
  associateSubsystemControlLinks(
    subsystemLinkSystemIds: number[],
    controlLinkSystemId: number,
  ): Promise<void>;

  /**
   * Returns all SubsystemControlLink segments for the given fileSystemId (with overlay).
   * Used by ControlChainResolutionService and ControlIntentPropagationService.
   */
  getAllSubsystemControlLinks(
    fileSystemId: number,
  ): Promise<SubsystemControlLink[]>;

  /** Returns all effective canonical control links in the file. */
  getAllControlLinks(fileSystemId: number): Promise<ControlLink[]>;

  /**
   * Returns the allocated intent IDs for the given control port, with overlay applied.
   * Returns an empty array if the port has no allocated intents.
   */
  getAllocatedIntentIds(
    portSystemId: number,
    fileSystemId: number,
  ): Promise<{intentSystemId: number; intentId: number}[]>;

  /**
   * Stages CREATE edit-actions for the given intents on a control port.
   * Each intent row: (intentSystemId, controlPortSystemId, intentId).
   */
  createIntents(
    intents: {
      systemId: number;
      controlPortSystemId: number;
      intentId: number;
    }[],
  ): Promise<void>;

  /**
   * Stages DELETE edit-actions for the given intent system IDs on a control port.
   */
  deleteIntents(
    intentSystemIds: number[],
    controlPortSystemId: number,
  ): Promise<void>;
}
