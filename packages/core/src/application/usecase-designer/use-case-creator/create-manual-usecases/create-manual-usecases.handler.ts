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
import type {UseCase} from '../../../../domain/entities/usecase-data/usecase/usecase.js';
import {
  createManualRoutingInput,
  findDuplicateActiveSubgraphSystemIds,
} from '../contracts/routing-input.js';
import type {RoutingOutcome} from '../contracts/routing-outcome.js';
import {createRoutingEngine} from '../engine/create-routing-engine.js';
import type {RoutingEngine} from '../engine/routing-engine.js';
import {readRoutingGraphEdits} from '../shared/read-routing-graph-edits.js';
import {RoutingGraphSnapshotBuilder} from '../services/routing-graph-snapshot-builder.js';
import {SubsystemLinkResolutionService} from '../services/subsystem-link-resolution.service.js';
import {prepareRoutingSnapshot} from '../services/prepare-routing-snapshot.js';
import {resolveRoutingLinkSelection} from '../services/routing-link-selection-resolver.js';
import {parseId} from '../../shared/parse-id.js';
import {assembleManualTopology} from './manual-topology-assembler.js';
import {CreateManualUsecasesCommand} from './create-manual-usecases.command.js';

/**
 * Adapts the manual-usecase command into the shared routing pipeline.
 *
 * The handler validates the request, resolves subsystem links, builds the immutable graph
 * snapshot, assembles the client-selected manual pairs, and delegates routing and persistence to the
 * engine.
 */
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
  ) {}

  async handle(
    command: CreateManualUsecasesCommand,
  ): Promise<Result<RoutingOutcome>> {
    const duplicateSubgraphIds = findDuplicateActiveSubgraphSystemIds(
      command.input.activeSubgraphs.map(sg =>
        parseId(sg.systemId, 'activeSubgraphs.systemId'),
      ),
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
        await this.subsystemLinkResolutionService.resolveAllChains(
          this.uow,
          this.idGeneration,
        );
      if (resolution.kind === RESULT_KIND.Fail)
        throw new DomainRuleViolationException(resolution.issues);
      const selectionResult = await resolveRoutingLinkSelection(
        command.fileSystemId,
        command.input,
        this.uow,
      );
      if (selectionResult.kind === RESULT_KIND.Fail)
        throw new DomainRuleViolationException(selectionResult.issues);
      const selection = selectionResult.data;
      const graphEdits = await readRoutingGraphEdits(
        this.uow,
        command.fileSystemId,
      );
      const activeManualUsecaseEdits = await this.uow
        .getUsecaseRepository()
        .findWithActiveManualEdits(command.fileSystemId);
      const selectedUsecases: UseCase[] = []; // engine requires an empty list, NA for manual workflow

      const graphSnapshot = await prepareRoutingSnapshot(
        {
          fileSystemId: command.fileSystemId,
          selection,
          selectedUsecases,
          graphEdits,
          activeManualUsecaseEdits,
          isManual: true,
        },
        this.snapshotBuilder,
        this.uow,
      );
      const topology = assembleManualTopology(
        graphSnapshot.routableDataLinks,
        graphSnapshot.routableControlLinks,
        graphSnapshot.subgraphs.map(s => s.subgraph.systemId),
      );
      if (topology.kind === RESULT_KIND.Fail)
        throw new DomainRuleViolationException(topology.issues);
      const input = createManualRoutingInput({
        fileSystemId: command.fileSystemId,
        selection,
        selectedUsecases,
        graphSnapshot,
        manualTopology: topology.data,
        activeManualUsecaseEdits,
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
