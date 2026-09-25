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
import {findDuplicateActiveSubgraphSystemIds} from '../contracts/routing-input.js';
import type {RoutingOutcome} from '../contracts/routing-outcome.js';
import {createRoutingEngine} from '../engine/create-routing-engine.js';
import type {RoutingEngine} from '../engine/routing-engine.js';
import {RoutingGraphSnapshotBuilder} from '../services/routing-graph-snapshot-builder.js';
import {SubsystemLinkResolutionService} from '../services/subsystem-link-resolution.service.js';
import {AutoRoutingPreparationService} from '../services/auto-routing-preparation.service.js';
import {CreateUsecasesCommand} from './create-usecases.command.js';

export class CreateUsecasesHandler implements CommandHandler<
  CreateUsecasesCommand,
  Result<RoutingOutcome>
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
    subsystemLinkResolutionService: SubsystemLinkResolutionService = new SubsystemLinkResolutionService(),
    private readonly engine: RoutingEngine = createRoutingEngine(),
    snapshotBuilder: RoutingGraphSnapshotBuilder = new RoutingGraphSnapshotBuilder(),
    private readonly preparation: AutoRoutingPreparationService = new AutoRoutingPreparationService(
      subsystemLinkResolutionService,
      snapshotBuilder,
    ),
  ) {}

  async handle(
    command: CreateUsecasesCommand,
  ): Promise<Result<RoutingOutcome>> {
    const duplicateSubgraphIds = findDuplicateActiveSubgraphSystemIds(
      command.selection.activeSubgraphs,
    );
    if (duplicateSubgraphIds.size > 0)
      throw new DomainRuleViolationException([
        RoutingIssueFactory.duplicateActiveSubgraphSelections(
          duplicateSubgraphIds,
        ),
      ]);

    await this.uow.startTransaction();
    try {
      const input = await this.preparation.prepare(command, this.uow);
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
