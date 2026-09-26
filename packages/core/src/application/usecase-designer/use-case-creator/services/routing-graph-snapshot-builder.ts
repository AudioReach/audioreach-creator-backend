/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ControlLink} from '../../../../domain/entities/usecase-data/links/control-link.js';
import type {DataLink} from '../../../../domain/entities/usecase-data/links/data-link.js';
import type {Subgraph} from '../../../../domain/entities/usecase-data/subgraph/subgraph.js';
import {Result} from '../../../shared/result/result.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import {READ_MODE} from '../../../ports/persistence/repositories/usecase/usecase.repository.js';
import type {
  ActiveSubgraphSelection,
  GraphEditSummary,
  RoutingGraphSnapshot,
  RoutingRequestPolicy,
} from '../contracts/routing-input.js';
import {
  copyGraphEditSummary,
  findDuplicateActiveSubgraphSystemIds,
} from '../contracts/routing-input.js';
import {RoutingIssueFactory} from '../issues/routing-issue-factory.js';
import {MdfClassificationService} from './mdf-classification.service.js';

export interface RoutingGraphSnapshotBuildInput {
  readonly fileSystemId: number;
  readonly effectiveActiveSubgraphs: readonly ActiveSubgraphSelection[];
  readonly requestPolicy: RoutingRequestPolicy;
  readonly sessionEdits: GraphEditSummary;
}

function isInScope(
  link: DataLink | ControlLink,
  effectiveIds: ReadonlySet<number>,
): boolean {
  return (
    effectiveIds.has(link.sourceSubgraphSystemId) &&
    effectiveIds.has(link.destSubgraphSystemId)
  );
}

function isRoutable(
  link: DataLink | ControlLink,
  effectiveIds: ReadonlySet<number>,
  excludedSubgraphIds: ReadonlySet<number>,
  excludedLinkIds: ReadonlySet<number>,
): boolean {
  return (
    isInScope(link, effectiveIds) &&
    !excludedSubgraphIds.has(link.sourceSubgraphSystemId) &&
    !excludedSubgraphIds.has(link.destSubgraphSystemId) &&
    !excludedLinkIds.has(link.systemId)
  );
}

/** Builds the single prepared graph view shared by routing consumers. */
export class RoutingGraphSnapshotBuilder {
  constructor(
    private readonly mdfClassification: MdfClassificationService = new MdfClassificationService(),
  ) {}

  async build(
    input: RoutingGraphSnapshotBuildInput,
    uow: UnitOfWork,
  ): Promise<Result<RoutingGraphSnapshot>> {
    const duplicateSubgraphIds = findDuplicateActiveSubgraphSystemIds(
      input.effectiveActiveSubgraphs,
    );
    if (duplicateSubgraphIds.size > 0)
      return Result.fail(
        RoutingIssueFactory.duplicateActiveSubgraphSelections(
          duplicateSubgraphIds,
        ),
      );

    const selections = input.effectiveActiveSubgraphs;
    const effectiveIds = new Set(
      selections.map(selection => selection.systemId),
    );
    const [
      subgraphData,
      overlayDataLinks,
      overlayControlLinks,
      committedUsecases,
    ] = await Promise.all([
      uow
        .getSubgraphRepository()
        .getAggregates([...effectiveIds], input.fileSystemId),
      uow.getDataLinkRepository().findIntraUcLinksByFile(input.fileSystemId),
      uow.getControlLinkRepository().findIntraUcLinksByFile(input.fileSystemId),
      uow.getUsecaseRepository().findAll(input.fileSystemId, {
        readMode: READ_MODE.Committed,
      }),
    ]);
    const subgraphs = [...subgraphData.values()].map(data => data.subgraph);

    const subgraphsById = new Map(
      subgraphs.map(subgraph => [subgraph.systemId, subgraph]),
    );
    const missingIssues = selections
      .filter(selection => !subgraphsById.has(selection.systemId))
      .map(selection =>
        IssueFactory.notFound(ISSUE_ENTITY_TYPE.Subgraph, selection.systemId),
      );
    const integrityIssues = overlayDataLinks
      .filter(link => isInScope(link, effectiveIds))
      .filter(
        link =>
          !subgraphsById.has(link.sourceSubgraphSystemId) ||
          !subgraphsById.has(link.destSubgraphSystemId),
      )
      .map(link =>
        RoutingIssueFactory.dataLinkIntegrity(
          link.systemId,
          link.sourceSubgraphSystemId,
          link.destSubgraphSystemId,
        ),
      );
    if (missingIssues.length > 0 || integrityIssues.length > 0)
      return Result.fail(...missingIssues, ...integrityIssues);

    const mdfSubgraphIds = await this.mdfClassification.classify(
      subgraphs,
      input.fileSystemId,
      uow,
    );
    const routingSubgraphs = selections.map(selection => {
      const subgraph = subgraphsById.get(selection.systemId) as Subgraph;
      return Object.freeze({
        subgraph,
        requestedSgkvs: Object.freeze(
          selection.sgkvs.map(values => Object.freeze([...values])),
        ),
        isMdf: mdfSubgraphIds.has(selection.systemId),
      });
    });

    const excludedSubgraphIds =
      input.requestPolicy.explicitlyExcludedSubgraphSystemIds;
    const routableDataLinks = overlayDataLinks.filter(link =>
      isRoutable(
        link,
        effectiveIds,
        excludedSubgraphIds,
        input.requestPolicy.explicitlyExcludedDataLinkSystemIds,
      ),
    );
    const routableControlLinks = overlayControlLinks.filter(link =>
      isRoutable(
        link,
        effectiveIds,
        excludedSubgraphIds,
        input.requestPolicy.explicitlyExcludedControlLinkSystemIds,
      ),
    );

    return Result.ok(
      Object.freeze({
        subgraphs: Object.freeze(routingSubgraphs),
        routableDataLinks: Object.freeze([...routableDataLinks]),
        routableControlLinks: Object.freeze([...routableControlLinks]),
        overlayDataLinks: Object.freeze([...overlayDataLinks]),
        overlayControlLinks: Object.freeze([...overlayControlLinks]),
        committedUsecases: Object.freeze([...committedUsecases]),
        sessionEdits: copyGraphEditSummary(input.sessionEdits),
      }),
    );
  }
}
