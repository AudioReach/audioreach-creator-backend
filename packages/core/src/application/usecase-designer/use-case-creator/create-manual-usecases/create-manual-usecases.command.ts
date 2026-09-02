/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseCommand} from '../../../../application/shared/base-command.js';
import {SESSION_MODE} from '../../../../application/shared/change-vocabulary.js';
import type {ActiveSubgraphSelection} from '../contracts/routing-input.js';

export interface CreateManualUsecasesCommandInput {
  readonly selectedUsecaseSystemIds: readonly number[];
  readonly activeSubgraphs: readonly ActiveSubgraphSelection[];
  readonly excludedDataLinkSystemIds?: readonly number[];
  readonly excludedControlLinkSystemIds?: readonly number[];
  readonly excludedSubgraphSystemIds?: readonly number[];
}

export class CreateManualUsecasesCommand extends BaseCommand {
  static override readonly requiresSession = true;
  static override readonly allowedModes = [
    SESSION_MODE.Designer,
    SESSION_MODE.DiffMerge,
  ] as const;

  readonly selectedUsecaseSystemIds: readonly number[];
  readonly activeSubgraphs: readonly ActiveSubgraphSelection[];
  readonly excludedDataLinkSystemIds: readonly number[];
  readonly excludedControlLinkSystemIds: readonly number[];
  readonly excludedSubgraphSystemIds: readonly number[];

  constructor(
    public readonly fileSystemId: number,
    input: CreateManualUsecasesCommandInput,
  ) {
    super();
    this.selectedUsecaseSystemIds = [...input.selectedUsecaseSystemIds];
    this.activeSubgraphs = input.activeSubgraphs.map(selection => ({
      systemId: selection.systemId,
      sgkvs: selection.sgkvs.map(values => [...values]),
    }));
    this.excludedDataLinkSystemIds = [
      ...(input.excludedDataLinkSystemIds ?? []),
    ];
    this.excludedControlLinkSystemIds = [
      ...(input.excludedControlLinkSystemIds ?? []),
    ];
    this.excludedSubgraphSystemIds = [
      ...(input.excludedSubgraphSystemIds ?? []),
    ];
  }
}
