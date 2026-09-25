/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../application/shared/result/result.js';
import {RoutingIssueFactory} from '../issues/routing-issue-factory.js';
import {buildProjectedUsecaseTopology} from '../shared/projected-usecase-topology.js';
import type {RoutingContext} from '../contracts/routing-context.js';
import type {Issue} from '../../../../shared/issues/issue.js';
import {ORPHAN_KIND, type OrphanCandidate} from '../contracts/routing-state.js';
import type {SubsystemRepository} from '../../../ports/persistence/repositories/subsystem/subsystem.repository.js';

export class OrphanValidationService {
  async run(
    context: RoutingContext,
    subsystemRepository: SubsystemRepository,
  ): Promise<ReturnType<typeof Result.ok<void>>> {
    const topology = buildProjectedUsecaseTopology(context);
    const orphanSubsystemSystemIds =
      await subsystemRepository.findOrphanSubsystemSystemIds(
        context.input.fileSystemId,
      );
    const local: Array<{
      readonly candidate: OrphanCandidate;
      readonly issues: readonly Issue[];
      readonly order: number;
    }> = [];

    for (const item of context.input.graphSnapshot.subgraphs) {
      const systemId = item.subgraph.systemId;
      if (topology.subgraphSystemIds.has(systemId)) continue;
      const issues: Issue[] = [RoutingIssueFactory.orphanSubgraph(systemId)];
      if (item.subgraph.sgkvs.length > 0)
        issues.push(RoutingIssueFactory.orphanSubgraphHasKvs(systemId));
      local.push({
        candidate: {kind: ORPHAN_KIND.Subgraph, systemId},
        issues,
        order: 0,
      });
    }

    for (const systemId of orphanSubsystemSystemIds) {
      local.push({
        candidate: {kind: ORPHAN_KIND.Subsystem, systemId},
        issues: [RoutingIssueFactory.orphanSubsystem(systemId)],
        order: 1,
      });
    }

    for (const link of context.input.graphSnapshot.overlayDataLinks) {
      const key = `${link.sourceSubgraphSystemId}>${link.destSubgraphSystemId}`;
      if (topology.directedPairKeys.has(key)) continue;
      local.push({
        candidate: {kind: ORPHAN_KIND.DataLink, systemId: link.systemId},
        issues: [RoutingIssueFactory.orphanDataLink(link.systemId)],
        order: 2,
      });
    }

    for (const link of context.input.graphSnapshot.overlayControlLinks) {
      const key = [link.sourceSubgraphSystemId, link.destSubgraphSystemId]
        .sort((left, right) => left - right)
        .join('>');
      if (topology.unorderedPairKeys.has(key)) continue;
      local.push({
        candidate: {kind: ORPHAN_KIND.ControlLink, systemId: link.systemId},
        issues: [RoutingIssueFactory.orphanControlLink(link.systemId)],
        order: 3,
      });
    }

    local.sort(
      (left, right) =>
        left.order - right.order ||
        left.candidate.systemId - right.candidate.systemId,
    );
    context.orphanCandidates.push(...local.map(item => item.candidate));
    context.warnings.push(...local.flatMap(item => item.issues));
    return Result.ok();
  }
}
