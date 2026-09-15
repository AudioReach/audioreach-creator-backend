/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DomainRuleViolationException} from '../../../../shared/exceptions/domain-rule-violation.exception.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {RESULT_KIND} from '../../../shared/result/result.js';
import type {Result} from '../../../shared/result/result.js';
import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import {
  createManualRoutingInput,
  deriveRoutingScope,
} from '../contracts/routing-input.js';
import type {RoutingOutcome} from '../contracts/routing-outcome.js';
import {createRoutingEngine} from '../engine/create-routing-engine.js';
import {ManualPairDiscoveryService} from '../services/manual-pair-discovery.service.js';
import {readRoutingGraphEdits} from '../shared/read-routing-graph-edits.js';
import {SubsystemLinkResolutionService} from '../services/subsystem-link-resolution.service.js';
import {CreateManualUsecasesCommand} from './create-manual-usecases.command.js';

export class CreateManualUsecasesHandler implements CommandHandler<
  CreateManualUsecasesCommand,
  Result<RoutingOutcome>
> {
  private readonly subsystemLinkResolutionService =
    new SubsystemLinkResolutionService();
  private readonly engine = createRoutingEngine();
  private readonly pairDiscovery = new ManualPairDiscoveryService();
  constructor(private readonly uow: UnitOfWork) {}

  async handle(
    command: CreateManualUsecasesCommand,
  ): Promise<Result<RoutingOutcome>> {
    await this.uow.startTransaction();
    try {
      const resolution =
        await this.subsystemLinkResolutionService.resolveAllChains(this.uow);
      if (resolution.kind === RESULT_KIND.Fail)
        throw new DomainRuleViolationException(resolution.issues);
      const graphEdits = await readRoutingGraphEdits(
        this.uow,
        command.fileSystemId,
      );
      const selectedUsecases = await this.uow
        .getUsecaseRepository()
        .findBySystemIds(
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
      const topology = await this.pairDiscovery.discover(
        {
          fileSystemId: command.fileSystemId,
          selectedUsecases,
          activeSubgraphs: scope.effectiveActiveSubgraphs,
          excludedDataLinkSystemIds: new Set(command.excludedDataLinkSystemIds),
          excludedControlLinkSystemIds: new Set(
            command.excludedControlLinkSystemIds,
          ),
        },
        this.uow,
      );
      if (topology.kind === RESULT_KIND.Fail)
        throw new DomainRuleViolationException(topology.issues);
      const input = createManualRoutingInput({
        selectedUsecases,
        activeSubgraphs: scope.effectiveActiveSubgraphs,
        scopePolicy: {
          requestedSubgraphSystemIds: scope.inputSubgraphs,
          excludedSubgraphSystemIds: new Set(command.excludedSubgraphSystemIds),
        },
        excludedDataLinkSystemIds: command.excludedDataLinkSystemIds,
        excludedControlLinkSystemIds: command.excludedControlLinkSystemIds,
        graphEdits,
        manualTopology: topology.data,
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
