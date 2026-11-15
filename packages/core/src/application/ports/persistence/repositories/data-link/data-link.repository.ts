/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataLink} from '../../../../../domain/entities/usecase-data/links/data-link.js';
import type {SubsystemDataLink} from '../../../../../domain/entities/usecase-data/links/subsystem-data-link.js';
import type {PortIoType} from '../../../../../domain/entities/common/enums/port-io-type.js';
import type {EditOptions} from '../../edit-options.js';
import type {LinksForPair, SubgraphPair} from '../shared/links-for-pair.js';
import type {DataLinkQueryService} from '../../query-services/link/data-link-query-service.js';

export interface DataLinkTopology {
  dataLinks: DataLink[];
  unresolvedSubsystemDataLinks: SubsystemDataLink[];
}

export interface BoundaryPortPayload {
  portSystemId: number;
  nodeSystemId: number;
  nodeParentId: number | null;
  portIoType: PortIoType;
  dataPortId: number;
  fileSystemId: number;
}

/**
 * Loads and changes data links in a unit of work. The reads are inherited
 * from `DataLinkQueryService`; the methods here load links a command then
 * changes, and stage the changes.
 */
export interface DataLinkRepository extends DataLinkQueryService {
  findLinksConnectedToModule(
    moduleSystemId: number,
    fileSystemId: number,
  ): Promise<DataLink[]>;

  findUnresolvedSubsystemLinksFromModule(
    moduleSystemId: number,
    fileSystemId: number,
  ): Promise<SubsystemDataLink[]>;

  getAllLinks(fileSystemId: number): Promise<DataLinkTopology>;

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
   * Writes a single unresolved SLS (dataLinkSystemId = null) CREATE row to
   * edit_actions. Used for FR-DLS-11 Branch B where no parent DataLink exists.
   */
  createSubsystemDataLink(
    sls: SubsystemDataLink,
    options?: EditOptions,
  ): Promise<void>;
}
