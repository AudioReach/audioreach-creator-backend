/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {ControlLink} from '../../../../../../src/domain/entities/usecase-data/links/control-link.js';
import {DataLink} from '../../../../../../src/domain/entities/usecase-data/links/data-link.js';
import {
  createControlLinkManualTopologyPair,
  createDataLinkManualTopologyPair,
  type ManualTopologyPair,
} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {RoutingIssueFactory} from '../../../../../../src/application/usecase-designer/use-case-creator/issues/routing-issue-factory.js';
import {DirectedCycleDetector} from '../../../../../../src/application/usecase-designer/use-case-creator/shared/directed-cycle-detector.js';
import {ISSUE_CODE} from '../../../../../../src/shared/issues/operational-codes.js';
import {IssueSeverity} from '../../../../../../src/shared/issues/severity.js';

function dataLink(
  systemId: number,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
): DataLink {
  return new DataLink({
    systemId,
    sourceNodeSystemId: systemId * 10 + 1,
    destinationNodeSystemId: systemId * 10 + 2,
    sourcePortSystemId: systemId * 10 + 3,
    destinationPortSystemId: systemId * 10 + 4,
    linkType: 'NORMAL' as never,
    sourceSubgraphSystemId,
    destSubgraphSystemId,
    fileSystemId: 1,
  });
}

function controlLink(
  systemId: number,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
): ControlLink {
  return new ControlLink(
    systemId,
    1,
    systemId * 10 + 1,
    systemId * 10 + 2,
    systemId * 10 + 3,
    systemId * 10 + 4,
    0,
    'NORMAL' as never,
    sourceSubgraphSystemId,
    destSubgraphSystemId,
  );
}

function dataPair(
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
  systemIds: readonly number[],
): ManualTopologyPair {
  return createDataLinkManualTopologyPair(
    {sourceSubgraphSystemId, destSubgraphSystemId},
    systemIds.map(systemId =>
      dataLink(systemId, sourceSubgraphSystemId, destSubgraphSystemId),
    ),
  );
}

function controlPair(
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
  systemIds: readonly number[],
): ManualTopologyPair {
  return createControlLinkManualTopologyPair(
    {
      sourceSubgraphSystemId: Math.min(
        sourceSubgraphSystemId,
        destSubgraphSystemId,
      ),
      destSubgraphSystemId: Math.max(
        sourceSubgraphSystemId,
        destSubgraphSystemId,
      ),
    },
    systemIds.map(systemId =>
      controlLink(systemId, sourceSubgraphSystemId, destSubgraphSystemId),
    ),
  );
}

describe('DirectedCycleDetector', () => {
  const detector = new DirectedCycleDetector();

  it('returns every supporting ID for each edge in a deterministic two-node data cycle', () => {
    expect(
      detector.findCycle([dataPair(1, 2, [12, 11]), dataPair(2, 1, [14, 13])]),
    ).toEqual({
      subgraphSystemIds: [1, 2, 1],
      dataLinkSystemIds: [11, 12, 13, 14],
    });
  });

  it('returns the same diagnostic regardless of pair or link input order', () => {
    const first = detector.findCycle([
      dataPair(3, 1, [31, 30]),
      dataPair(1, 2, [12, 11]),
      dataPair(2, 3, [23, 22]),
    ]);
    const second = detector.findCycle([
      dataPair(2, 3, [22, 23]),
      dataPair(1, 2, [11, 12]),
      dataPair(3, 1, [30, 31]),
    ]);

    expect(second).toEqual(first);
  });

  it('does not treat opposing control-only pairs as a cycle', () => {
    expect(
      detector.findCycle([controlPair(1, 2, [21]), controlPair(2, 1, [22])]),
    ).toBeNull();
  });

  it('retains all supporting links on every edge of a longer cycle', () => {
    expect(
      detector.findCycle([
        dataPair(2, 3, [23, 22]),
        dataPair(3, 1, [31, 30]),
        dataPair(1, 2, [12, 11]),
      ]),
    ).toEqual({
      subgraphSystemIds: [1, 2, 3, 1],
      dataLinkSystemIds: [11, 12, 22, 23, 30, 31],
    });
  });

  it('skips disconnected acyclic components before selecting the first cycle', () => {
    expect(
      detector.findCycle([
        dataPair(1, 2, [12]),
        dataPair(2, 3, [23]),
        dataPair(11, 10, [111]),
        dataPair(10, 11, [101]),
      ]),
    ).toEqual({
      subgraphSystemIds: [10, 11, 10],
      dataLinkSystemIds: [101, 111],
    });
  });

  it('selects the same first cycle when multiple cycles arrive in different orders', () => {
    const first = detector.findCycle([
      dataPair(3, 1, [31]),
      dataPair(1, 3, [13]),
      dataPair(2, 1, [21]),
      dataPair(1, 2, [12]),
    ]);
    const second = detector.findCycle([
      dataPair(1, 2, [12]),
      dataPair(2, 1, [21]),
      dataPair(1, 3, [13]),
      dataPair(3, 1, [31]),
    ]);

    expect(first).toEqual({
      subgraphSystemIds: [1, 2, 1],
      dataLinkSystemIds: [12, 21],
    });
    expect(second).toEqual(first);
  });

  it('exposes a deterministic error issue for the selected cycle', () => {
    const issue = RoutingIssueFactory.manualCycleDetected({
      subgraphSystemIds: [1, 2, 1],
      dataLinkSystemIds: [11, 12, 13, 14],
    });

    expect(issue).toEqual({
      code: ISSUE_CODE.ROUTING_MANUAL_CYCLE,
      message:
        'Manual topology contains a data-link cycle: 1 -> 2 -> 1 ' +
        '(supporting data links: [11, 12, 13, 14]).',
      severity: IssueSeverity.Error,
    });
  });
});
