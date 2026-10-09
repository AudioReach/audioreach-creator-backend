/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../../application/shared/result/result.js';
import {DATA_LINK_TYPE} from '../../../../../domain/entities/usecase-data/links/data-link-type.js';
import type {UseCase} from '../../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {RoutingContext} from '../../contracts/routing-context.js';
import {RoutingIssueFactory} from '../../issues/routing-issue-factory.js';
import {effectiveUsecasesWithManualEdits} from '../../shared/effective-usecase-catalog.js';
import {logicalEcConnections} from '../../shared/logical-ec-connections.js';
import {directedPairKey} from '../../shared/usecase-topology.js';
import {ManualUsecaseDependencyValidator} from './manual-usecase-dependency-validator.js';

function usecaseEcLinks(usecase: UseCase, context: RoutingContext) {
  const pairKeys = new Set(
    usecase.subgraphPairs.map(pair =>
      directedPairKey(pair.sourceSubgraphSystemId, pair.destSubgraphSystemId),
    ),
  );
  const linksById = new Map(
    // Rule C also applies to committed UCs whose physical support is being deleted in
    // this session. Retain those links for validation, then let an overlay link with
    // the same ID win so each physical link is counted only once.
    [
      ...context.input.graphSnapshot.sessionEdits.deletedDataLinks,
      ...context.input.graphSnapshot.overlayDataLinks,
    ].map(link => [link.systemId, link]),
  );
  return [...linksById.values()].filter(
    link =>
      link.linkType === DATA_LINK_TYPE.Ec &&
      pairKeys.has(
        directedPairKey(link.sourceSubgraphSystemId, link.destSubgraphSystemId),
      ),
  );
}

/**
 * Performs blocking checks before topology analysis can publish routing decisions.
 *
 * It validates graph-link integrity, the MDF empty-value invariant, active manual
 * dependencies, and EC connection cardinality so later phases can rely on a valid
 * snapshot and precedence rules.
 */
export class PreValidationPhase {
  constructor(
    private readonly manualDependencyValidator: ManualUsecaseDependencyValidator = new ManualUsecaseDependencyValidator(),
  ) {}

  run(context: RoutingContext): Result<void> {
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
    if (integrityIssues.length > 0) return Result.fail(...integrityIssues);

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
    if (mdfIssues.length > 0) return Result.fail(...mdfIssues);

    const manualIssues = this.manualDependencyValidator.run(
      context.input.activeManualUsecaseEdits,
      context.input.graphSnapshot,
    );
    if (manualIssues.length > 0) return Result.fail(...manualIssues);

    const ecIssues = effectiveUsecasesWithManualEdits(
      context.input.graphSnapshot.committedUsecases,
      context.input.activeManualUsecaseEdits,
    ).flatMap(usecase => {
      const ecLinks = usecaseEcLinks(usecase, context);
      const logicalConnections = logicalEcConnections(
        ecLinks,
        context.input.graphSnapshot.mdfSubgraphSystemIds,
      );
      return logicalConnections.length <= 1
        ? []
        : [
            RoutingIssueFactory.multipleEcConnectionsInUsecase(
              usecase.systemId,
              ecLinks.map(link => link.systemId),
              usecase.subgraphPairs.length,
            ),
          ];
    });
    if (ecIssues.length > 0) return Result.fail(...ecIssues);

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
    return Result.ok();
  }
}
