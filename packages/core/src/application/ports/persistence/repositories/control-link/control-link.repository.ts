/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ControlLink} from '../../../../../domain/entities/usecase-data/links/control-link.js';
import type {SubsystemControlLink} from '../../../../../domain/entities/usecase-data/links/subsystem-control-link.js';

export interface ControlLinkRepository {
  /**
   * Returns all control links whose src or dst port is in portSystemIds.
   * Empty input short-circuits — returns [] without querying the DB.
   */
  getLinksByPortSystemIds(
    portSystemIds: number[],
    fileSystemId: number,
  ): Promise<{linkSystemId: number; portSystemId: number}[]>;

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

  /** Stages an UPDATE edit-action to restore a soft-deleted ControlLink. */
  reactivateControlLink(systemId: number): Promise<void>;

  /** Stages a DELETE edit-action to soft-delete the ControlLink. */
  softDeleteControlLink(systemId: number): Promise<void>;

  /** Stages an UPDATE edit-action to change the heapId on a ControlLink. */
  updateHeapId(systemId: number, heapId: number): Promise<void>;

  /** Stages a CREATE edit-action for a SubsystemControlLink segment. */
  createSubsystemControlLink(scl: SubsystemControlLink): Promise<void>;

  /**
   * Returns all SubsystemControlLink segments for the given fileSystemId (with overlay).
   * Used by ControlChainResolutionService and ControlIntentPropagationService.
   */
  getAllSubsystemControlLinks(fileSystemId: number): Promise<SubsystemControlLink[]>;

  /**
   * Returns the allocated intent IDs for the given control port, with overlay applied.
   * Returns an empty array if the port has no allocated intents.
   */
  getAllocatedIntentIds(portSystemId: number, fileSystemId: number): Promise<{intentSystemId: number; intentId: number}[]>;

  /**
   * Stages CREATE edit-actions for the given intents on a control port.
   * Each intent row: (intentSystemId, controlPortSystemId, intentId).
   */
  createIntents(intents: {systemId: number; controlPortSystemId: number; intentId: number}[]): Promise<void>;

  /**
   * Stages DELETE edit-actions for the given intent system IDs on a control port.
   */
  deleteIntents(intentSystemIds: number[], controlPortSystemId: number): Promise<void>;
}
