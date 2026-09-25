/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {
  RESULT_KIND,
  Result,
} from '../../../../../../src/application/shared/result/result.js';
import {
  COLLISION_RESOLUTION_MODE,
  type SameGkvCollision,
} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/same-gkv-collision.js';
import type {AutoRoutingInput} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {ResolveSameGkvCollisionCommand} from '../../../../../../src/application/usecase-designer/use-case-creator/resolve-same-gkv-collision/resolve-same-gkv-collision.command.js';
import {ResolveSameGkvCollisionHandler} from '../../../../../../src/application/usecase-designer/use-case-creator/resolve-same-gkv-collision/resolve-same-gkv-collision.handler.js';

const replayInput = {
  selectedUsecaseSystemIds: [10],
  activeSubgraphs: [{systemId: 20, sgkvs: [[30]]}],
  excludedSubgraphSystemIds: [40],
  excludedDataLinkSystemIds: [50],
  excludedControlLinkSystemIds: [60],
} as const;

const collision = (
  mode: (typeof COLLISION_RESOLUTION_MODE)[keyof typeof COLLISION_RESOLUTION_MODE],
): SameGkvCollision =>
  ({
    collisionId: '11111111-1111-4111-8111-111111111111',
    gkvValueSystemIds: [1],
    operands: [
      {kind: 'NEW', candidate: {}},
      {kind: 'NEW', candidate: {}},
    ],
    options: [mode],
  }) as unknown as SameGkvCollision;

function makeUow() {
  const rollback = jest.fn(async () => undefined);
  return {
    uow: {
      startTransaction: jest.fn(async () => undefined),
      commit: jest.fn(async () => undefined),
      rollback,
      isInTransaction: jest.fn(() => true),
      getWriteContext: () => ({
        session: {sessionId: 7, fileSystemId: 1},
        groupId: 'group-1',
      }),
    },
    rollback,
  };
}

function command(
  mode: (typeof COLLISION_RESOLUTION_MODE)[keyof typeof COLLISION_RESOLUTION_MODE],
) {
  return new ResolveSameGkvCollisionCommand(
    mode,
    '11111111-1111-4111-8111-111111111111',
    replayInput,
  );
}

describe('ResolveSameGkvCollisionHandler', () => {
  it('replays the original input, stages MANUAL changes, and commits', async () => {
    const {uow} = makeUow();
    const preparation = {
      prepare: jest.fn(
        async () => ({fileSystemId: 1}) as unknown as AutoRoutingInput,
      ),
    };
    const engine = {
      resolveCollision: jest.fn(async () =>
        Result.ok(collision(COLLISION_RESOLUTION_MODE.PathA)),
      ),
    };
    const stager = {
      stage: jest.fn(async () => [
        {systemId: 10, changeId: 20, operation: 'CREATE', source: 'MANUAL'},
      ]),
    };
    const handler = new ResolveSameGkvCollisionHandler(
      uow as never,
      {} as never,
      preparation as never,
      engine as never,
      stager as never,
    );

    const result = await handler.handle(
      command(COLLISION_RESOLUTION_MODE.PathA),
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(preparation.prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        selection: replayInput,
      }),
      uow,
    );
    expect(engine.resolveCollision).toHaveBeenCalledWith(
      expect.anything(),
      uow,
      '11111111-1111-4111-8111-111111111111',
    );
    expect(stager.stage).toHaveBeenCalledWith(
      expect.anything(),
      COLLISION_RESOLUTION_MODE.PathA,
      expect.anything(),
      uow,
      expect.anything(),
    );
    expect(uow.commit).toHaveBeenCalledTimes(1);
  });

  it('returns a factory-owned stale issue without staging when replay fails', async () => {
    const {uow, rollback} = makeUow();
    const preparation = {
      prepare: jest.fn(async () => ({}) as AutoRoutingInput),
    };
    const engine = {
      resolveCollision: jest.fn(async () =>
        Result.fail({
          code: 'ARC-ROUTING-SAME-GKV-CHOICE-STALE',
          message: 'stale',
        } as never),
      ),
    };
    const stager = {stage: jest.fn()};
    const handler = new ResolveSameGkvCollisionHandler(
      uow as never,
      {} as never,
      preparation as never,
      engine as never,
      stager as never,
    );

    await expect(
      handler.handle(command(COLLISION_RESOLUTION_MODE.PathA)),
    ).rejects.toEqual(
      expect.objectContaining({
        errorCode: 'DOMAIN_RULE_VIOLATION',
        issues: [
          expect.objectContaining({
            code: 'ARC-ROUTING-SAME-GKV-CHOICE-STALE',
          }),
        ],
      }),
    );
    expect(stager.stage).not.toHaveBeenCalled();
    expect(rollback).toHaveBeenCalledTimes(1);
  });

  it('rejects an option that is no longer available', async () => {
    const {uow, rollback} = makeUow();
    const engine = {
      resolveCollision: jest.fn(async () =>
        Result.ok(collision(COLLISION_RESOLUTION_MODE.PathA)),
      ),
    };
    const stager = {stage: jest.fn()};
    const handler = new ResolveSameGkvCollisionHandler(
      uow as never,
      {} as never,
      {prepare: jest.fn(async () => ({}) as AutoRoutingInput)} as never,
      engine as never,
      stager as never,
    );

    await expect(
      handler.handle(command(COLLISION_RESOLUTION_MODE.PathB)),
    ).rejects.toEqual(
      expect.objectContaining({
        issues: [
          expect.objectContaining({
            code: 'ARC-ROUTING-SAME-GKV-CHOICE-STALE',
          }),
        ],
      }),
    );
    expect(stager.stage).not.toHaveBeenCalled();
    expect(rollback).toHaveBeenCalledTimes(1);
  });
});
