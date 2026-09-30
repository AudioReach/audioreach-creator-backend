/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import {
  RESULT_KIND,
  Result,
} from '../../../../../../src/application/shared/result/result.js';
import type {AutoRoutingInput} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import type {SameGkvCollisionGroup} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/same-gkv-collision.js';
import {ResolveSameGkvCollisionCommand} from '../../../../../../src/application/usecase-designer/use-case-creator/resolve-same-gkv-collision/resolve-same-gkv-collision.command.js';
import {ResolveSameGkvCollisionHandler} from '../../../../../../src/application/usecase-designer/use-case-creator/resolve-same-gkv-collision/resolve-same-gkv-collision.handler.js';

const replayInput = {
  selectedUsecaseSystemIds: [10],
  activeSubgraphs: [{systemId: 20, sgkvs: [[30]]}],
  excludedSubgraphSystemIds: [40],
  excludedDataLinkSystemIds: [50],
  excludedControlLinkSystemIds: [60],
} as const;

const selectedAlternativeId = '22222222-2222-4222-8222-222222222222';
const group: SameGkvCollisionGroup = {
  collisionId: '11111111-1111-4111-8111-111111111111',
  gkvValueSystemIds: [100],
  alternatives: [
    {
      alternativeId: selectedAlternativeId,
      kind: 'NEW',
      candidate: {} as never,
    },
    {
      alternativeId: '33333333-3333-4333-8333-333333333333',
      kind: 'NEW',
      candidate: {} as never,
    },
  ],
};

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

function command(alternativeId = selectedAlternativeId) {
  return new ResolveSameGkvCollisionCommand(
    {
      mode: 'SELECT_CANDIDATE',
      collisionId: group.collisionId,
      alternativeId,
    },
    replayInput,
  );
}

describe('ResolveSameGkvCollisionHandler', () => {
  it('replays the complete group, stages the selection, and commits', async () => {
    const {uow} = makeUow();
    const preparation = {
      prepare: jest.fn(
        async () => ({fileSystemId: 1}) as unknown as AutoRoutingInput,
      ),
    };
    const engine = {resolveCollision: jest.fn(async () => Result.ok(group))};
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

    const result = await handler.handle(command());

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(engine.resolveCollision).toHaveBeenCalledWith(
      expect.anything(),
      uow,
      group.collisionId,
    );
    expect(stager.stage).toHaveBeenCalledWith(
      group,
      command().selection,
      expect.anything(),
      uow,
      expect.anything(),
    );
    expect(uow.commit).toHaveBeenCalledTimes(1);
  });

  it('rolls back without staging when replay cannot reproduce the group', async () => {
    const {uow, rollback} = makeUow();
    const stager = {stage: jest.fn()};
    const handler = new ResolveSameGkvCollisionHandler(
      uow as never,
      {} as never,
      {prepare: jest.fn(async () => ({}) as AutoRoutingInput)} as never,
      {
        resolveCollision: jest.fn(async () =>
          Result.fail({
            code: 'ARC-ROUTING-SAME-GKV-CHOICE-STALE',
            message: 'stale',
          } as never),
        ),
      } as never,
      stager as never,
    );

    await expect(handler.handle(command())).rejects.toEqual(
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

  it('rejects a selected candidate that is no longer in the group', async () => {
    const {uow, rollback} = makeUow();
    const stager = {stage: jest.fn()};
    const handler = new ResolveSameGkvCollisionHandler(
      uow as never,
      {} as never,
      {prepare: jest.fn(async () => ({}) as AutoRoutingInput)} as never,
      {resolveCollision: jest.fn(async () => Result.ok(group))} as never,
      stager as never,
    );

    await expect(
      handler.handle(command('44444444-4444-4444-8444-444444444444')),
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

  it('rejects KEEP_EXISTING when the group has no existing alternative', async () => {
    const {uow, rollback} = makeUow();
    const stager = {stage: jest.fn()};
    const handler = new ResolveSameGkvCollisionHandler(
      uow as never,
      {} as never,
      {prepare: jest.fn(async () => ({}) as AutoRoutingInput)} as never,
      {resolveCollision: jest.fn(async () => Result.ok(group))} as never,
      stager as never,
    );

    await expect(
      handler.handle(
        new ResolveSameGkvCollisionCommand(
          {mode: 'KEEP_EXISTING', collisionId: group.collisionId},
          replayInput,
        ),
      ),
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
