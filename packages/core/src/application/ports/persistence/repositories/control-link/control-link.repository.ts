/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ControlLink} from '../../../../../domain/entities/usecase-data/links/control-link.js';
import type {SubsystemControlLink} from '../../../../../domain/entities/usecase-data/links/subsystem-control-link.js';
import type {EditOptions} from '../../edit-options.js';
import type {ControlLinkQueryService} from '../../query-services/link/control-link-query-service.js';

export interface ControlLinkTopology {
  controlLinks: ControlLink[];
  unresolvedSubsystemControlLinks: SubsystemControlLink[];
}

/**
 * Loads and changes control links in a unit of work. The reads are
 * inherited from `ControlLinkQueryService`; the methods here load links a
 * command then changes, and stage the changes.
 */
export interface ControlLinkRepository extends ControlLinkQueryService {
  findLinksConnectedToModule(
    moduleSystemId: number,
    fileSystemId: number,
  ): Promise<ControlLink[]>;

  findUnresolvedSubsystemLinksFromModule(
    moduleSystemId: number,
    fileSystemId: number,
  ): Promise<SubsystemControlLink[]>;

  getAllLinks(fileSystemId: number): Promise<ControlLinkTopology>;

  /**
   * Resolves existing unresolved subsystem segments by setting their canonical
   * ControlLink ID in the current session overlay. Empty input is a no-op.
   */
  resolveSubsystemControlLinks(
    subsystemLinkSystemIds: readonly number[],
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

  /** Stages a CREATE edit-action for the given ControlLink. */
  createControlLink(link: ControlLink): Promise<void>;

  /** Stages an UPDATE edit-action to change the heapId on a ControlLink. */
  updateHeapId(systemId: number, heapId: number): Promise<void>;

  /** Stages a CREATE edit-action for a SubsystemControlLink segment. */
  createSubsystemControlLink(scl: SubsystemControlLink): Promise<void>;

  /**
   * Atomically replaces the intent allocation on a control port:
   * stages DELETE edit-actions for toDelete system IDs first, then
   * CREATE edit-actions for toCreate rows.
   */
  updateIntents(
    controlPortSystemId: number,
    toCreate: {systemId: number; intentId: number}[],
    toDelete: number[],
  ): Promise<void>;
}
