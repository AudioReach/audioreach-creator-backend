/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DomainRuleViolationException} from '../../../../shared/exceptions/domain-rule-violation.exception.js';
import {RoutingIssueFactory} from '../issues/routing-issue-factory.js';
import {RESULT_KIND} from '../../../shared/result/result.js';
import type {Result} from '../../../shared/result/result.js';
import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import {
  createManualRoutingInput,
  deriveRoutingScope,
  findDuplicateActiveSubgraphSystemIds,
} from '../contracts/routing-input.js';
import type {RoutingOutcome} from '../contracts/routing-outcome.js';
import {createRoutingEngine} from '../engine/create-routing-engine.js';
import type {RoutingEngine} from '../engine/routing-engine.js';
import {ManualPairDiscoveryService} from '../services/manual-pair-discovery.service.js';
import {readRoutingGraphEdits} from '../shared/read-routing-graph-edits.js';
import {validateRoutingAdditionClosure} from '../shared/validate-routing-addition-closure.js';
import {RoutingGraphSnapshotBuilder} from '../services/routing-graph-snapshot-builder.js';
import {SubsystemLinkResolutionService} from '../services/subsystem-link-resolution.service.js';
import {CreateManualUsecasesCommand} from './create-manual-usecases.command.js';

export class CreateManualUsecasesHandler implements CommandHandler<
  CreateManualUsecasesCommand,
  Result<RoutingOutcome>
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
    private readonly subsystemLinkResolutionService: SubsystemLinkResolutionService = new SubsystemLinkResolutionService(),
    private readonly engine: RoutingEngine = createRoutingEngine(),
    private readonly snapshotBuilder: RoutingGraphSnapshotBuilder = new RoutingGraphSnapshotBuilder(),
    private readonly pairDiscovery: ManualPairDiscoveryService = new ManualPairDiscoveryService(),
  ) {}

  async handle(
    command: CreateManualUsecasesCommand,
  ): Promise<Result<RoutingOutcome>> {
    const {selection} = command;
    const duplicateSubgraphIds = findDuplicateActiveSubgraphSystemIds(
      selection.activeSubgraphs,
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
      const graphEdits = await readRoutingGraphEdits(
        this.uow,
        command.fileSystemId,
      );
      const selectedUsecases = await this.uow
        .getUsecaseRepository()
        .findBySystemIds(
          command.fileSystemId,
          selection.selectedUsecaseSystemIds,
        );
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
        this.uow,
      );
      if (snapshot.kind === RESULT_KIND.Fail)
        throw new DomainRuleViolationException(snapshot.issues);
      const topology = this.pairDiscovery.discover({
        selectedUsecases,
        subgraphs: snapshot.data.subgraphs,
        dataLinks: snapshot.data.routableDataLinks,
        controlLinks: snapshot.data.routableControlLinks,
      });
      if (topology.kind === RESULT_KIND.Fail)
        throw new DomainRuleViolationException(topology.issues);
      const input = createManualRoutingInput({
        fileSystemId: command.fileSystemId,
        selection,
        selectedUsecases,
        graphSnapshot: snapshot.data,
        manualTopology: topology.data,
      });
      const result = await this.engine.run(input, this.uow, this.idGeneration);
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
