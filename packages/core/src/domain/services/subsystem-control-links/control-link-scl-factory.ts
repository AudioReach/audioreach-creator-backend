/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {SubsystemBoundaryPathService} from '../shared/subsystem-boundary-path.service.js';

export interface SclFactoryInput {
  nodeASystemId: number;
  nodeBSystemId: number;
  nodeParentMap: Map<number, number | null>;
}

export interface SclFactoryOutput {
  /** Ordered node IDs from SubsystemBoundaryPathService.
   *  Length <= 2 means both nodes share a subsystem context — no SCL needed. */
  nodeSequence: number[];
}

export const ControlLinkSclFactory = {
  compute(input: SclFactoryInput): SclFactoryOutput {
    const path = SubsystemBoundaryPathService.compute({
      sourceNodeId: input.nodeASystemId,
      destNodeId: input.nodeBSystemId,
      nodeParentMap: input.nodeParentMap,
    });
    return {nodeSequence: path.nodeSequence};
  },
} as const;
