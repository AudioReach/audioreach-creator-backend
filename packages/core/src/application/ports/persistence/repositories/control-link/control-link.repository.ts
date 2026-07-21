/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ControlLink} from '../../../../../domain/entities/usecase-data/links/control-link.js';
import type {EditOptions} from '../../edit-options.js';

export interface SubsystemControlLinkSpec {
  systemId: number;
  peerNodeASystemId: number;
  peerNodeBSystemId: number;
  nodeAPortSystemId: number;
  nodeBPortSystemId: number;
  controlLinkSystemId: number;
  fileSystemId: number;
}

export type ControlLinkDelta = Partial<
  Pick<ControlLink, 'heapId' | 'linkType'>
>;

export interface ControlLinkRepository {
  /**
   * Returns all control links whose src or dst port is in portSystemIds.
   * Empty input short-circuits — returns [] without querying the DB.
   */
  getLinksByPortSystemIds(
    portSystemIds: number[],
    fileSystemId: number,
  ): Promise<{linkSystemId: number; portSystemId: number}[]>;

  /**
   * Returns all non-deleted ControlLinks that have the given portSystemId
   * as either nodeAPortSystemId or nodeBPortSystemId.
   * Used for subsystem port side-conflict checks (FR-CLS-04 Step 1).
   */
  findNonDeletedByPort(
    portSystemId: number,
    fileSystemId: number,
  ): Promise<ControlLink[]>;

  /**
   * Overlay-aware lookup by canonical port pair.
   * Returns the ControlLink if it exists and is not soft-deleted; null otherwise.
   */
  findNonDeletedByPortPair(
    nodeAPortSystemId: number,
    nodeBPortSystemId: number,
    fileSystemId: number,
  ): Promise<ControlLink | null>;

  /**
   * Overlay-aware lookup for a soft-deleted row by canonical port pair.
   * Returns the ControlLink only if the committed row exists AND has a pending DELETE
   * in the edit session. Returns null otherwise.
   */
  findSoftDeletedByPortPair(
    nodeAPortSystemId: number,
    nodeBPortSystemId: number,
    fileSystemId: number,
  ): Promise<ControlLink | null>;

  /** Stages a CREATE edit-action for a ControlLink row. */
  createControlLink(link: ControlLink, options?: EditOptions): Promise<void>;

  /** Stages a CREATE edit-action for a SubsystemControlLink segment row. */
  createSubsystemControlLink(
    scl: SubsystemControlLinkSpec,
    options?: EditOptions,
  ): Promise<void>;

  /** Stages a CREATE edit-action for a ControlPort row on a given node. */
  stageControlPortCreate(args: {
    systemId: number;
    nodeSystemId: number;
    portId: number;
    isStatic: boolean;
    fileSystemId: number;
  }): Promise<void>;

  /** Stages a CREATE edit-action for an Intent row on a given control port. */
  stageIntentCreate(args: {
    systemId: number;
    controlPortSystemId: number;
    intentId: number;
  }): Promise<void>;

  /**
   * Stages an accumulator-mode UPDATE on a ControlLink row.
   * Used for heapId updates and soft-delete re-activation.
   */
  patchControlLink(
    systemId: number,
    delta: ControlLinkDelta,
    options?: EditOptions,
  ): Promise<void>;
}
