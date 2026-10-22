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
  type AutoRoutingInput,
  type RoutingSelection,
} from '../contracts/routing-input.js';
import {readRoutingGraphEdits} from '../shared/read-routing-graph-edits.js';
import {SubsystemLinkResolutionService} from './subsystem-link-resolution.service.js';
import {RoutingGraphSnapshotBuilder} from './routing-graph-snapshot-builder.js';
import {prepareRoutingSnapshot} from './prepare-routing-snapshot.js';

export interface AutoRoutingPreparationInput {
  readonly fileSystemId: number;
  readonly selection: RoutingSelection;
}

/**
 * Prepares the immutable input consumed by the automatic routing pipeline.
 *
 * Used by `CreateUsecasesHandler` and `ResolveSameGkvCollisionHandler`.
 */
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

    // `target_table='UseCase'` and `source='MANUAL'`
    const activeManualUsecaseEdits =
      await usecaseRepository.findWithActiveManualEdits(command.fileSystemId);

    const graphSnapshot = await prepareRoutingSnapshot(
      {
        fileSystemId: command.fileSystemId,
        selection,
        selectedUsecases,
        graphEdits,
        activeManualUsecaseEdits,
      },
      this.snapshotBuilder,
      uow,
    );

    return createAutoRoutingInput({
      fileSystemId: command.fileSystemId,
      selectedUsecases,
      graphSnapshot,
      selection,
      activeManualUsecaseEdits,
    });
  }
}
