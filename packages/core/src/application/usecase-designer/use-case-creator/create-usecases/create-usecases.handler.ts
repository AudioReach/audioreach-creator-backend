/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {USECASE_TYPE} from '../../../../domain/entities/usecase-data/usecase/usecase-type.js';
import {DomainRuleViolationException} from '../../../../shared/exceptions/domain-rule-violation.exception.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {SOURCE} from '../../../shared/change-vocabulary.js';
import {RESULT_KIND} from '../../../shared/result/result.js';
import type {Result} from '../../../shared/result/result.js';
import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import {READ_MODE} from '../../../ports/persistence/repositories/usecase/usecase.repository.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import {
  createAutoRoutingInput,
  deriveRoutingScope,
} from '../contracts/routing-input.js';
import type {RoutingOutcome} from '../contracts/routing-outcome.js';
import {createRoutingEngine} from '../engine/create-routing-engine.js';
import {readRoutingGraphEdits} from '../shared/read-routing-graph-edits.js';
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

  async handle(
    command: CreateUsecasesCommand,
  ): Promise<Result<RoutingOutcome>> {
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
      if (scope.missingSelectedScopeSubgraphs.size > 0)
        throw new DomainRuleViolationException([
          IssueFactory.routingSelectedScopeIncomplete(
            scope.missingSelectedScopeSubgraphs,
          ),
        ]);
      const committedUsecases = await usecaseRepository.findAll(
        command.fileSystemId,
        {readMode: READ_MODE.Committed},
      );
      const input = createAutoRoutingInput({
        selectedUsecases,
        activeSubgraphs: scope.effectiveActiveSubgraphs,
        scopePolicy: {
          requestedSubgraphSystemIds: scope.inputSubgraphs,
          excludedSubgraphSystemIds: new Set(command.excludedSubgraphSystemIds),
        },
        excludedDataLinkSystemIds: command.excludedDataLinkSystemIds,
        excludedControlLinkSystemIds: command.excludedControlLinkSystemIds,
        graphEdits,
        islandUcs: committedUsecases.filter(
          usecase => usecase.type === USECASE_TYPE.Island,
        ),
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
