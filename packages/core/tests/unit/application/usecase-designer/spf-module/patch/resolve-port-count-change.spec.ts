/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {resolvePortCountChange} from '../../../../../../src/application/usecase-designer/spf-module/patch/resolve-port-count-change.js';
import {RESULT_KIND} from '../../../../../../src/application/shared/result/result.js';
import {ISSUE_CODE} from '../../../../../../src/shared/issues/operational-codes.js';
import {ISSUE_ENTITY_TYPE} from '../../../../../../src/shared/issues/impacted-entity.js';

describe('resolvePortCountChange', () => {
  it('returns no-op when requested equals current count', () => {
    const result = resolvePortCountChange(
      [{systemId: 1}, {systemId: 2}],
      2,
      4,
      [],
      ISSUE_ENTITY_TYPE.DataPort,
      10,
    );
    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(result.data).toEqual({toAdd: 0, toRemove: []});
  });

  it('returns fail with ARC-MOD-PORT-COUNT-EXCEEDS-DEFINITION when requested > max', () => {
    const result = resolvePortCountChange(
      [],
      5,
      3,
      [],
      ISSUE_ENTITY_TYPE.DataPort,
      10,
    );
    expect(result.kind).toBe(RESULT_KIND.Fail);
    expect(result.issues[0].code).toBe(
      ISSUE_CODE.MOD_PORT_COUNT_EXCEEDS_DEFINITION,
    );
  });

  it('returns increase delta when requested > current', () => {
    const result = resolvePortCountChange(
      [{systemId: 1}],
      3,
      4,
      [],
      ISSUE_ENTITY_TYPE.DataPort,
      10,
    );
    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(result.data).toEqual({toAdd: 2, toRemove: []});
  });

  it('returns LIFO toRemove list when all excess ports are unused', () => {
    const result = resolvePortCountChange(
      [{systemId: 1}, {systemId: 3}, {systemId: 2}],
      1,
      4,
      [],
      ISSUE_ENTITY_TYPE.DataPort,
      10,
    );
    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(result.data!.toRemove).toEqual([3, 2]);
  });

  it('returns one blocked issue per linked port when insufficient unused ports', () => {
    const links = [
      {portSystemId: 2, linkSystemId: 100},
      {portSystemId: 3, linkSystemId: 101},
    ];
    const result = resolvePortCountChange(
      [{systemId: 1}, {systemId: 2}, {systemId: 3}],
      1,
      4,
      links,
      ISSUE_ENTITY_TYPE.DataPort,
      10,
    );
    expect(result.kind).toBe(RESULT_KIND.Fail);
    expect(result.issues).toHaveLength(2);
    expect(
      result.issues.every(
        i => i.code === ISSUE_CODE.MOD_PORT_COUNT_DECREASE_BLOCKED,
      ),
    ).toBe(true);
    const blockedIds = result.issues
      .map(i => i.impactedEntity!.systemId)
      .sort();
    expect(blockedIds).toEqual([2, 3]);
  });

  it('issue message includes link system IDs', () => {
    const links = [{portSystemId: 5, linkSystemId: 999}];
    const result = resolvePortCountChange(
      [{systemId: 5}],
      0,
      2,
      links,
      ISSUE_ENTITY_TYPE.DataPort,
      10,
    );
    expect(result.kind).toBe(RESULT_KIND.Fail);
    expect(result.issues[0].message).toContain('999');
  });

  it('uses ControlPort entityType when specified', () => {
    const links = [{portSystemId: 5, linkSystemId: 42}];
    const result = resolvePortCountChange(
      [{systemId: 5}],
      0,
      2,
      links,
      ISSUE_ENTITY_TYPE.ControlPort,
      10,
    );
    expect(result.kind).toBe(RESULT_KIND.Fail);
    expect(result.issues[0].impactedEntity!.entityType).toBe(
      ISSUE_ENTITY_TYPE.ControlPort,
    );
  });

  it('allows decrease when some ports are linked but enough unused exist', () => {
    const links = [{portSystemId: 3, linkSystemId: 200}];
    const result = resolvePortCountChange(
      [{systemId: 1}, {systemId: 2}, {systemId: 3}],
      1,
      4,
      links,
      ISSUE_ENTITY_TYPE.DataPort,
      10,
    );
    expect(result.kind).toBe(RESULT_KIND.Ok);
    // diff = 3 - 1 = 2; unused = [1, 2]; LIFO removes highest first → [2, 1]
    expect(result.data!.toRemove).toEqual([2, 1]);
  });
});
