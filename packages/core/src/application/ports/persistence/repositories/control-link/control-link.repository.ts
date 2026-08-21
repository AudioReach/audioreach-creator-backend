/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ControlLink} from '../../../../../domain/entities/usecase-data/links/control-link.js';
import type {SubsystemControlLink} from '../../../../../domain/entities/usecase-data/links/subsystem-control-link.js';
import type {NodeType} from '../../../../../domain/entities/usecase-data/node/node.js';
import type {EditOptions} from '../../edit-options.js';
import type {SessionChanged} from '../shared/session-changed.js';

export interface SubsystemControlRouteContext {
  subsystemControlLinks: SubsystemControlLink[];
  nodeTypeBySystemId: ReadonlyMap<number, NodeType>;
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

  findSubsystemControlRouteContext(
    fileSystemId: number,
  ): Promise<SubsystemControlRouteContext>;

  /**
   * Deletes the canonical link and every currently resolved subsystem segment
   * associated with it. Unresolved segments are intentionally not included.
   */
  deleteAggregate(
    controlLinkSystemId: number,
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<void>;

  /**
   * Deletes the specified subsystem segments. An unresolved segment is deleted
   * directly. For a resolved segment, the canonical ControlLink is deleted and
   * non-target sibling segments are updated to have a null ControlLink FK in
   * the edit-action overlay so chain resolution can process them later.
   */
  deleteSubsystemControlLinks(
    subsystemLinkSystemIds: number[],
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<void>;

  /**
   * Returns all control links whose src or dst port is in portSystemIds.
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
   * Returns the non-deleted ControlLink matching the given canonical port pair,
   * or null if not found.
   */
  findActiveByPortPair(
    portASystemId: number,
    portBSystemId: number,
    fileSystemId: number,
  ): Promise<ControlLink | null>;

  /**
   * Returns the soft-deleted ControlLink matching the given canonical port pair,
   * or null if not found.
   */
  findSoftDeletedByPortPair(
    portASystemId: number,
    portBSystemId: number,
    fileSystemId: number,
  ): Promise<ControlLink | null>;

  /** Stages a CREATE edit-action for the given ControlLink. */
  createControlLink(link: ControlLink): Promise<void>;

  /** Supersedes the staged DELETE and stages a CREATE restoring the ControlLink. */
  reactivateControlLink(link: ControlLink): Promise<void>;

  /** Stages a DELETE edit-action to soft-delete the ControlLink. */
  softDeleteControlLink(systemId: number): Promise<void>;

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
