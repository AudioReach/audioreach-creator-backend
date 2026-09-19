/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../application/shared/result/result.js';
import type {RoutingContext} from '../contracts/routing-context.js';
import {RoutingIssueFactory} from '../issues/routing-issue-factory.js';

export class PreValidationService {
  run(context: RoutingContext): Promise<Result<void>> {
    const {subgraphs, routableDataLinks} = context.input.graphSnapshot;
    const subgraphIds = new Set(subgraphs.map(item => item.subgraph.systemId));
    const integrityIssues = routableDataLinks
      .filter(
        link =>
          !subgraphIds.has(link.sourceSubgraphSystemId) ||
          !subgraphIds.has(link.destSubgraphSystemId),
      )
      .map(link =>
        RoutingIssueFactory.dataLinkIntegrity(
          link.systemId,
          link.sourceSubgraphSystemId,
          link.destSubgraphSystemId,
        ),
      );
    if (integrityIssues.length > 0)
      return Promise.resolve(Result.fail(...integrityIssues));

    const adjacentIds = new Set<number>();
    for (const link of routableDataLinks) {
      adjacentIds.add(link.sourceSubgraphSystemId);
      adjacentIds.add(link.destSubgraphSystemId);
    }
    for (const item of subgraphs) {
      if (!adjacentIds.has(item.subgraph.systemId))
        context.warnings.push(
          RoutingIssueFactory.islandDetected(item.subgraph.systemId),
        );
    }
    return Promise.resolve(Result.ok());
  }
}
