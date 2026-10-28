/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface ActiveSubgraphSelectionInput {
  readonly systemId: string;
  readonly valueSystemIds: readonly (readonly string[])[];
}

/**
 * Base request fields shared by both routing commands.
 * IDs remain raw strings; resolution happens in Phase 0 via resolveRoutingLinkSelection.
 */
export interface RoutingCommandInput {
  readonly activeSubgraphs: readonly ActiveSubgraphSelectionInput[];
  readonly includedDataLinkSystemIds: readonly string[];
  readonly includedControlLinkSystemIds: readonly string[];
}

/** Extends base with optional usecase IDs for incremental automatic routing. */
export interface AutoRoutingCommandInput extends RoutingCommandInput {
  readonly usecaseSystemIds?: readonly string[];
}
