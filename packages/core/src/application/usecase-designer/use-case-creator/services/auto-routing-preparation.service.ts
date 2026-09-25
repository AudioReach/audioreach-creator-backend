/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DomainRuleViolationException} from '../../../../shared/exceptions/domain-rule-violation.exception.js';
import {SOURCE} from '../../../shared/change-vocabulary.js';
import {RESULT_KIND} from '../../../shared/result/result.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import {
  createAutoRoutingInput,
  deriveRoutingScope,
  type AutoRoutingInput,
  type RoutingSelection,
} from '../contracts/routing-input.js';
import {RoutingIssueFactory} from '../issues/routing-issue-factory.js';
import {readRoutingGraphEdits} from '../shared/read-routing-graph-edits.js';
import {validateRoutingAdditionClosure} from '../shared/validate-routing-addition-closure.js';
import {SubsystemLinkResolutionService} from './subsystem-link-resolution.service.js';
import {RoutingGraphSnapshotBuilder} from './routing-graph-snapshot-builder.js';

export interface AutoRoutingPreparationInput {
  readonly fileSystemId: number;
  readonly selection: RoutingSelection;
}

export class AutoRoutingPreparationService {
  constructor(
    private readonly subsystemLinkResolutionService: SubsystemLinkResolutionService = new SubsystemLinkResolutionService(),
    private readonly snapshotBuilder: RoutingGraphSnapshotBuilder = new RoutingGraphSnapshotBuilder(),
  ) {}

  async prepare(
    command: AutoRoutingPreparationInput,
    uow: UnitOfWork,
  ): Promise<AutoRoutingInput> {
    const {selection} = command;
    const resolution =
      await this.subsystemLinkResolutionService.resolveAllChains(uow);
    if (resolution.kind === RESULT_KIND.Fail)
      throw new DomainRuleViolationException(resolution.issues);

    const session = uow.getWriteContext().session;
    await uow
      .getSessionRepository()
      .deleteEditActionsBySource(session.sessionId, SOURCE.AutoRouting);
    const graphEdits = await readRoutingGraphEdits(uow, command.fileSystemId);
    const usecaseRepository = uow.getUsecaseRepository();
    const selectedUsecases = await usecaseRepository.findBySystemIds(
      command.fileSystemId,
      selection.selectedUsecaseSystemIds,
    );
    const activeManualUsecaseEdits =
      await usecaseRepository.findWithActiveManualEdits(command.fileSystemId);
    const scope = deriveRoutingScope(
      selectedUsecases,
      selection.activeSubgraphs,
      selection.excludedSubgraphSystemIds,
      graphEdits.deletedSgs.map(subgraph => subgraph.systemId),
    );
    const additionIssues = validateRoutingAdditionClosure(
      selection,
      graphEdits,
    );
    if (additionIssues.length > 0)
      throw new DomainRuleViolationException(additionIssues);
    if (scope.missingSelectedScopeSubgraphs.size > 0)
      throw new DomainRuleViolationException([
        RoutingIssueFactory.selectedScopeIncomplete(
          scope.missingSelectedScopeSubgraphs,
        ),
      ]);

    const snapshot = await this.snapshotBuilder.build(
      {
        fileSystemId: command.fileSystemId,
        effectiveActiveSubgraphs: scope.effectiveActiveSubgraphs,
        excludedDataLinkSystemIds: selection.excludedDataLinkSystemIds,
        excludedControlLinkSystemIds: selection.excludedControlLinkSystemIds,
        sessionEdits: graphEdits,
      },
      uow,
    );
    if (snapshot.kind === RESULT_KIND.Fail)
      throw new DomainRuleViolationException(snapshot.issues);

    return createAutoRoutingInput({
      fileSystemId: command.fileSystemId,
      selectedUsecases,
      graphSnapshot: snapshot.data,
      selection,
      activeManualUsecaseEdits,
    });
  }
}
