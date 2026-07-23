/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../shared/result/result.js';
import type {IssueEntityType} from '../../../../shared/issues/impacted-entity.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';

export interface PortCountChangeResult {
  /** Number of new ports to add. */
  toAdd: number;
  /** System IDs of ports to remove, sorted highest → lowest (LIFO). */
  toRemove: number[];
}

/**
 * Pure algorithm for port-count change decisions, shared by
 * applyDataPortCountChange and applyControlPortCountChange in
 * PatchSpfModuleHandler, and reusable for future subsystem operations.
 *
 * Does NOT perform DB access — all inputs are pre-computed by the caller.
 *
 * @param links - Active links returned by DataLinkRepository / ControlLinkRepository.
 *   Each entry maps one link to the port it is attached to. Passed from the
 *   caller so the decrease-blocked issue can include the link system IDs.
 */
export function resolvePortCountChange(
  currentPorts: ReadonlyArray<{systemId: number}>,
  requested: number,
  maxAllowed: number,
  links: ReadonlyArray<{portSystemId: number; linkSystemId: number}>,
  issueEntityType: IssueEntityType,
  parentSystemId: number,
): Result<PortCountChangeResult> {
  const currentCount = currentPorts.length;

  if (requested === currentCount) {
    return Result.ok({toAdd: 0, toRemove: []});
  }

  if (requested > maxAllowed) {
    return Result.fail(
      IssueFactory.portCountExceedsDefinition(
        issueEntityType,
        requested,
        maxAllowed,
        parentSystemId,
      ),
    );
  }

  if (requested > currentCount) {
    return Result.ok({toAdd: requested - currentCount, toRemove: []});
  }

  // Decrease path: build per-port link map from the links array
  const linksByPort = new Map<number, number[]>();
  for (const link of links) {
    const existing = linksByPort.get(link.portSystemId) ?? [];
    existing.push(link.linkSystemId);
    linksByPort.set(link.portSystemId, existing);
  }

  const linkedPortIds = new Set(linksByPort.keys());
  const diff = currentCount - requested;
  const unused = currentPorts.filter(p => !linkedPortIds.has(p.systemId));

  if (unused.length < diff) {
    // Not enough unused ports — report one issue per blocked (linked) port
    const blocked = currentPorts.filter(p => linkedPortIds.has(p.systemId));
    const issues = blocked.map(p =>
      IssueFactory.portCountDecreaseBlocked(
        p.systemId,
        issueEntityType,
        linksByPort.get(p.systemId) ?? [],
      ),
    );
    return Result.fail(...issues);
  }

  // LIFO: remove highest systemId first
  const toRemove = [...unused]
    .sort((a, b) => b.systemId - a.systemId)
    .slice(0, diff)
    .map(p => p.systemId);

  return Result.ok({toAdd: 0, toRemove});
}
