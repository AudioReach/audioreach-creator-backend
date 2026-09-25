/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DomainRuleViolationException} from '../../../../shared/exceptions/domain-rule-violation.exception.js';
import {RESULT_KIND, Result} from '../../../shared/result/result.js';
import type {Result as ResultType} from '../../../shared/result/result.js';
import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import {createRoutingEngine} from '../engine/create-routing-engine.js';
import type {RoutingEngine} from '../engine/routing-engine.js';
import {AutoRoutingPreparationService} from '../services/auto-routing-preparation.service.js';
import {SameGkvCollisionResolutionStager} from '../services/same-gkv-collision-resolution-stager.js';
import type {UsecaseChangeDescriptor} from '../contracts/routing-state.js';
import {RoutingIssueFactory} from '../issues/routing-issue-factory.js';
import {ResolveSameGkvCollisionCommand} from './resolve-same-gkv-collision.command.js';

export class ResolveSameGkvCollisionHandler implements CommandHandler<
  ResolveSameGkvCollisionCommand,
  ResultType<UsecaseChangeDescriptor[]>
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
    private readonly preparation: AutoRoutingPreparationService = new AutoRoutingPreparationService(),
    private readonly engine: RoutingEngine = createRoutingEngine(),
    private readonly stager: SameGkvCollisionResolutionStager = new SameGkvCollisionResolutionStager(),
  ) {}

  async handle(
    command: ResolveSameGkvCollisionCommand,
  ): Promise<ResultType<UsecaseChangeDescriptor[]>> {
    await this.uow.startTransaction();
    try {
      const fileSystemId = this.uow.getWriteContext().session.fileSystemId;
      const input = await this.preparation.prepare(
        {
          fileSystemId,
          selection: command.replayInput,
        },
        this.uow,
      );
      const replay = await this.engine.resolveCollision(
        input,
        this.uow,
        command.collisionId,
      );
      if (replay.kind === RESULT_KIND.Fail)
        throw new DomainRuleViolationException(replay.issues);
      if (!replay.data.options.includes(command.mode))
        throw new DomainRuleViolationException([
          RoutingIssueFactory.sameGkvChoiceStale(command.collisionId),
        ]);
      const changes = await this.stager.stage(
        replay.data,
        command.mode,
        input,
        this.uow,
        this.idGeneration,
      );
      await this.uow.commit();
      return Result.ok(changes);
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }
  }
}
