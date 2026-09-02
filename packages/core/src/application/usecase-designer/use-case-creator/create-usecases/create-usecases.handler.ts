/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DomainRuleViolationException} from '../../../../shared/exceptions/domain-rule-violation.exception.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {RESULT_KIND} from '../../../shared/result/result.js';
import type {Result} from '../../../shared/result/result.js';
import {SOURCE} from '../../../shared/change-vocabulary.js';
import {USECASE_TYPE} from '../../../../domain/entities/usecase-data/usecase/usecase-type.js';
import {READ_MODE} from '../../../ports/persistence/repositories/usecase/usecase.repository.js';
import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import {
  createAutoRoutingInput,
  deriveRoutingScope,
} from '../contracts/routing-input.js';
import {createRoutingEngine} from '../engine/create-routing-engine.js';
import type {RoutingOutcome} from '../contracts/routing-outcome.js';
import {SubsystemLinkResolutionService} from '../services/subsystem-link-resolution.service.js';
import {CreateUsecasesCommand} from './create-usecases.command.js';

export class CreateUsecasesHandler implements CommandHandler<
  CreateUsecasesCommand,
  Result<RoutingOutcome>
> {
  private readonly subsystemLinkResolutionService =
    new SubsystemLinkResolutionService();
  private readonly engine = createRoutingEngine();

  constructor(private readonly uow: UnitOfWork) {}

  async handle(command: CreateUsecasesCommand): Promise<Result<RoutingOutcome>> {
    await this.uow.startTransaction();
    try {
      const resolution =
        await this.subsystemLinkResolutionService.resolveAllChains(this.uow);
      if (resolution.kind === RESULT_KIND.Fail) {
        throw new DomainRuleViolationException(resolution.issues);
      }

      const session = this.uow.getWriteContext().session;
      await this.uow
        .getSessionRepository()
        .deleteEditActionsBySource(session.sessionId, SOURCE.AutoRouting);

      const graphEdits = await this.readGraphEdits(command.fileSystemId);
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
      if (scope.missingSelectedScopeSubgraphs.size > 0) {
        throw new DomainRuleViolationException([
          IssueFactory.routingSelectedScopeIncomplete(
            scope.missingSelectedScopeSubgraphs,
          ),
        ]);
      }
      const committedUsecases = await usecaseRepository.findAll(
        command.fileSystemId,
        {readMode: READ_MODE.Committed},
      );
      const islandUcs = committedUsecases.filter(
        usecase => usecase.type === USECASE_TYPE.Island,
      );

      const input = createAutoRoutingInput({
        selectedUsecaseSystemIds: command.selectedUsecaseSystemIds,
        selectedUsecases,
        activeSubgraphs: scope.effectiveActiveSubgraphs,
        excludedDataLinkSystemIds: command.excludedDataLinkSystemIds,
        excludedControlLinkSystemIds: command.excludedControlLinkSystemIds,
        excludedSubgraphSystemIds: command.excludedSubgraphSystemIds,
        selectedScopeSubgraphs: scope.selectedScopeSubgraphs,
        inputSubgraphs: scope.inputSubgraphs,
        outOfSelectionSubgraphs: scope.outOfSelectionSubgraphs,
        effectiveRoutingScope: scope.effectiveRoutingScope,
        graphEdits,
        islandUcs,
      });
      const result = await this.engine.run(input, this.uow);
      if (result.kind === RESULT_KIND.Fail) {
        throw new DomainRuleViolationException(result.issues);
      }
      await this.uow.commit();
      return result;
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }
  }

  private async readGraphEdits(fileSystemId: number) {
    const [subgraphs, dataLinks, controlLinks] = await Promise.all([
      this.uow.getSubgraphRepository().findChangedInSession(fileSystemId),
      this.uow.getDataLinkRepository().findChangedInSession(fileSystemId),
      this.uow.getControlLinkRepository().findChangedInSession(fileSystemId),
    ]);
    return {
      addedSgs: subgraphs.added,
      deletedSgs: subgraphs.deleted,
      addedDataLinks: dataLinks.added,
      deletedDataLinks: dataLinks.deleted,
      addedControlLinks: controlLinks.added,
      deletedControlLinks: controlLinks.deleted,
    };
  }
}
