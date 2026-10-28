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
import type {AutoRoutingCommandInput} from '../contracts/routing-command-input.js';
import {readRoutingGraphEdits} from '../shared/read-routing-graph-edits.js';
import {SubsystemLinkResolutionService} from './subsystem-link-resolution.service.js';
import {RoutingGraphSnapshotBuilder} from './routing-graph-snapshot-builder.js';
import {prepareRoutingSnapshot} from './prepare-routing-snapshot.js';
import {resolveRoutingLinkSelection} from './routing-link-selection-resolver.js';

/**
 * Prepares the immutable input consumed by the automatic routing pipeline.
 *
 * Used by `CreateUsecasesHandler` and `ResolveSameGkvCollisionHandler`.
 */
export class AutoRoutingPreparationService {
  constructor(
    private readonly subsystemLinkResolutionService: SubsystemLinkResolutionService = new SubsystemLinkResolutionService(),
    private readonly snapshotBuilder: RoutingGraphSnapshotBuilder = new RoutingGraphSnapshotBuilder(),
    private readonly resolveRoutingSelection = resolveRoutingLinkSelection,
  ) {}

  /** Resolves raw request IDs before preparing the current routing snapshot. */
  async prepareFromRawInput(
    fileSystemId: number,
    input: AutoRoutingCommandInput,
    uow: UnitOfWork,
  ): Promise<AutoRoutingInput> {
    await this.resolveSubsystemChains(uow);
    const selectionResult = await this.resolveRoutingSelection(
      fileSystemId,
      input,
      uow,
    );
    if (selectionResult.kind === RESULT_KIND.Fail)
      throw new DomainRuleViolationException(selectionResult.issues);
    return this.prepareCanonicalSelection(
      fileSystemId,
      selectionResult.data,
      uow,
    );
  }

  /** Prepares a canonical selection persisted for same-GKV collision replay. */
  async prepareFromSelection(
    fileSystemId: number,
    selection: RoutingSelection,
    uow: UnitOfWork,
  ): Promise<AutoRoutingInput> {
    await this.resolveSubsystemChains(uow);
    return this.prepareCanonicalSelection(fileSystemId, selection, uow);
  }

  private async resolveSubsystemChains(uow: UnitOfWork): Promise<void> {
    const resolution =
      await this.subsystemLinkResolutionService.resolveAllChains(uow);
    if (resolution.kind === RESULT_KIND.Fail)
      throw new DomainRuleViolationException(resolution.issues);
  }

  private async prepareCanonicalSelection(
    fileSystemId: number,
    selection: RoutingSelection,
    uow: UnitOfWork,
  ): Promise<AutoRoutingInput> {
    const session = uow.getWriteContext().session;
    await uow
      .getSessionRepository()
      .deleteEditActionsBySource(session.sessionId, SOURCE.AutoRouting);

    const graphEdits = await readRoutingGraphEdits(uow, fileSystemId);

    const usecaseRepository = uow.getUsecaseRepository();
    const selectedUsecases = selection.selectedUsecaseSystemIds?.length
      ? await usecaseRepository.findBySystemIds(
          fileSystemId,
          selection.selectedUsecaseSystemIds,
        )
      : [];

    // `target_table='UseCase'` and `source='MANUAL'`
    const activeManualUsecaseEdits =
      await usecaseRepository.findWithActiveManualEdits(fileSystemId);

    const graphSnapshot = await prepareRoutingSnapshot(
      {
        fileSystemId,
        selection,
        selectedUsecases,
        graphEdits,
        activeManualUsecaseEdits,
        isManual: false,
      },
      this.snapshotBuilder,
      uow,
    );

    return createAutoRoutingInput({
      fileSystemId,
      selectedUsecases,
      graphSnapshot,
      selection,
      activeManualUsecaseEdits,
    });
  }
}
