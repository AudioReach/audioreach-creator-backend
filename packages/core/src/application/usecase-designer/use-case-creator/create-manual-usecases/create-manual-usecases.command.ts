/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseCommand} from '../../../../application/shared/base-command.js';
import {SESSION_MODE} from '../../../../application/shared/change-vocabulary.js';
import {
  parseRoutingCommandInput,
  type RoutingCommandInput,
} from '../contracts/routing-command-input.js';
import type {ActiveSubgraphSelection} from '../contracts/routing-input.js';

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
    input: RoutingCommandInput,
  ) {
    super();
    const parsedInput = parseRoutingCommandInput(input);
    this.selectedUsecaseSystemIds = parsedInput.selectedUsecaseSystemIds;
    this.activeSubgraphs = parsedInput.activeSubgraphs;
    this.excludedDataLinkSystemIds = parsedInput.excludedDataLinkSystemIds;
    this.excludedControlLinkSystemIds =
      parsedInput.excludedControlLinkSystemIds;
    this.excludedSubgraphSystemIds = parsedInput.excludedSubgraphSystemIds;
  }
}
