/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DomainRuleViolationException} from '../../../../shared/exceptions/domain-rule-violation.exception.js';
import {RoutingIssueFactory} from '../issues/routing-issue-factory.js';
import {SOURCE} from '../../../shared/change-vocabulary.js';
import {RESULT_KIND} from '../../../shared/result/result.js';
import type {Result} from '../../../shared/result/result.js';
import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import {
  createAutoRoutingInput,
  deriveRoutingScope,
  findDuplicateActiveSubgraphSystemIds,
} from '../contracts/routing-input.js';
import type {RoutingOutcome} from '../contracts/routing-outcome.js';
import {createRoutingEngine} from '../engine/create-routing-engine.js';
import type {RoutingEngine} from '../engine/routing-engine.js';
import {readRoutingGraphEdits} from '../shared/read-routing-graph-edits.js';
import {validateRoutingAdditionClosure} from '../shared/validate-routing-addition-closure.js';
import {RoutingGraphSnapshotBuilder} from '../services/routing-graph-snapshot-builder.js';
import {SubsystemLinkResolutionService} from '../services/subsystem-link-resolution.service.js';
import {CreateUsecasesCommand} from './create-usecases.command.js';

export class CreateUsecasesHandler implements CommandHandler<
  CreateUsecasesCommand,
  Result<RoutingOutcome>
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly subsystemLinkResolutionService: SubsystemLinkResolutionService = new SubsystemLinkResolutionService(),
    private readonly engine: RoutingEngine = createRoutingEngine(),
    private readonly snapshotBuilder: RoutingGraphSnapshotBuilder = new RoutingGraphSnapshotBuilder(),
  ) {}

  async handle(
    command: CreateUsecasesCommand,
  ): Promise<Result<RoutingOutcome>> {
    const duplicateSubgraphIds = findDuplicateActiveSubgraphSystemIds(
      command.activeSubgraphs,
    );
    if (duplicateSubgraphIds.size > 0)
      throw new DomainRuleViolationException([
        RoutingIssueFactory.duplicateActiveSubgraphSelections(
          duplicateSubgraphIds,
        ),
      ]);

    await this.uow.startTransaction();
    try {
      const resolution =
        await this.subsystemLinkResolutionService.resolveAllChains(this.uow);
      if (resolution.kind === RESULT_KIND.Fail)
        throw new DomainRuleViolationException(resolution.issues);
      const session = this.uow.getWriteContext().session;
      await this.uow
        .getSessionRepository()
        .deleteEditActionsBySource(session.sessionId, SOURCE.AutoRouting);
      const graphEdits = await readRoutingGraphEdits(
        this.uow,
        command.fileSystemId,
      );
      const usecaseRepository = this.uow.getUsecaseRepository();
      const selectedUsecases = await usecaseRepository.findBySystemIds(
        command.fileSystemId,
        command.selectedUsecaseSystemIds,
      );
      const scope = deriveRoutingScope(
        selectedUsecases,
        command.activeSubgraphs,
        command.excludedSubgraphSystemIds,
        graphEdits.deletedSgs.map(subgraph => subgraph.systemId),
      );
      const additionIssues = validateRoutingAdditionClosure(
        command,
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
          requestPolicy: {
            requestedSubgraphSystemIds: new Set(
              command.activeSubgraphs.map(selection => selection.systemId),
            ),
            explicitlyExcludedSubgraphSystemIds: new Set(
              command.excludedSubgraphSystemIds,
            ),
            explicitlyExcludedDataLinkSystemIds: new Set(
              command.excludedDataLinkSystemIds,
            ),
            explicitlyExcludedControlLinkSystemIds: new Set(
              command.excludedControlLinkSystemIds,
            ),
          },
          sessionEdits: graphEdits,
        },
        this.uow,
      );
      if (snapshot.kind === RESULT_KIND.Fail)
        throw new DomainRuleViolationException(snapshot.issues);
      const input = createAutoRoutingInput({
        fileSystemId: command.fileSystemId,
        selectedUsecases,
        requestPolicy: {
          requestedSubgraphSystemIds: new Set(
            command.activeSubgraphs.map(selection => selection.systemId),
          ),
          explicitlyExcludedSubgraphSystemIds: new Set(
            command.excludedSubgraphSystemIds,
          ),
          explicitlyExcludedDataLinkSystemIds: new Set(
            command.excludedDataLinkSystemIds,
          ),
          explicitlyExcludedControlLinkSystemIds: new Set(
            command.excludedControlLinkSystemIds,
          ),
        },
        graphSnapshot: snapshot.data,
      });
      const result = await this.engine.run(input, this.uow);
      if (result.kind === RESULT_KIND.Fail)
        throw new DomainRuleViolationException(result.issues);
      await this.uow.commit();
      return result;
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }
  }
}
