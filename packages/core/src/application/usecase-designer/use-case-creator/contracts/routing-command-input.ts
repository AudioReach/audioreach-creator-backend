/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {parseId} from '../../shared/parse-id.js';
import type {ActiveSubgraphSelection} from './routing-input.js';

/** Raw SGKV selection received by either create-usecases command. */
export interface ActiveSubgraphSelectionInput {
  readonly systemId: string;
  readonly valueSystemIds: readonly (readonly string[])[];
}

/** Request-shaped fields shared by automatic and manual create-usecases commands. */
export interface RoutingCommandInput {
  readonly selectedUsecaseSystemIds: readonly string[];
  readonly activeSubgraphs: readonly ActiveSubgraphSelectionInput[];
  readonly excludedDataLinkSystemIds?: readonly string[];
  readonly excludedControlLinkSystemIds?: readonly string[];
  readonly excludedSubgraphSystemIds?: readonly string[];
}

export interface ParsedRoutingCommandInput {
  readonly selectedUsecaseSystemIds: readonly number[];
  readonly activeSubgraphs: readonly ActiveSubgraphSelection[];
  readonly excludedDataLinkSystemIds: readonly number[];
  readonly excludedControlLinkSystemIds: readonly number[];
  readonly excludedSubgraphSystemIds: readonly number[];
}

/** Parses the string IDs at the command boundary before routing begins. */
export function parseRoutingCommandInput(
  input: RoutingCommandInput,
): ParsedRoutingCommandInput {
  return {
    selectedUsecaseSystemIds: input.selectedUsecaseSystemIds.map(value =>
      parseId(value, 'selectedUsecaseSystemIds'),
    ),
    activeSubgraphs: input.activeSubgraphs.map(selection => ({
      systemId: parseId(selection.systemId, 'activeSubgraphs.systemId'),
      sgkvs: selection.valueSystemIds.map(values =>
        values.map(value => parseId(value, 'activeSubgraphs.valueSystemIds')),
      ),
    })),
    excludedDataLinkSystemIds: (input.excludedDataLinkSystemIds ?? []).map(
      value => parseId(value, 'excludedDataLinkSystemIds'),
    ),
    excludedControlLinkSystemIds: (
      input.excludedControlLinkSystemIds ?? []
    ).map(value => parseId(value, 'excludedControlLinkSystemIds')),
    excludedSubgraphSystemIds: (input.excludedSubgraphSystemIds ?? []).map(
      value => parseId(value, 'excludedSubgraphSystemIds'),
    ),
  };
}
