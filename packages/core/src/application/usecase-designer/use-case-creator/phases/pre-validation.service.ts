/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../application/shared/result/result.js';
import type {RoutingContext} from '../contracts/routing-context.js';
import {RoutingIssueFactory} from '../issues/routing-issue-factory.js';
import {ManualUsecaseDependencyValidator} from '../services/manual-usecase-dependency-validator.js';

/**
 * Performs blocking checks before topology analysis can publish routing decisions.
 *
 * It validates graph-link integrity, the MDF empty-value invariant, and active manual
 * dependencies so later phases can rely on a valid snapshot and precedence rules.
 */
export class PreValidationService {
  constructor(
    private readonly manualDependencyValidator: ManualUsecaseDependencyValidator = new ManualUsecaseDependencyValidator(),
  ) {}

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

    const mdfIssues = subgraphs
      .filter(
        item =>
          item.isMdf &&
          item.requestedSgkvs.some(
            valueDefinitionIds => valueDefinitionIds.length > 0,
          ),
      )
      .sort((left, right) => left.subgraph.systemId - right.subgraph.systemId)
      .map(item => RoutingIssueFactory.mdfKvAssigned(item.subgraph.systemId));
    if (mdfIssues.length > 0) return Promise.resolve(Result.fail(...mdfIssues));

    const manualIssues = this.manualDependencyValidator.run(
      context.input.activeManualUsecaseEdits,
      context.input.graphSnapshot,
    );
    if (manualIssues.length > 0)
      return Promise.resolve(Result.fail(...manualIssues));

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
