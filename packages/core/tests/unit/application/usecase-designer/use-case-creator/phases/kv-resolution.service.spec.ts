/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {UseCase} from '../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import {Subgraph} from '../../../../../../src/domain/entities/usecase-data/subgraph/subgraph.js';
import {RESULT_KIND} from '../../../../../../src/application/shared/result/result.js';
import type {SubgraphRepository} from '../../../../../../src/application/ports/persistence/repositories/subgraph/subgraph.repository.js';
import type {UnitOfWork} from '../../../../../../src/application/ports/persistence/unit-of-work.js';
import {
  createAutoRoutingInput,
  emptyGraphEdits,
  type RoutingGraphSnapshot,
} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {RoutingContext} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-context.js';
import {KvResolutionService} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/kv-resolution.service.js';

const FILE_ID = 1;

function makeSubgraph(
  systemId: number,
  requestedSgkvs: readonly (readonly number[])[],
  isMdf = false,
): RoutingGraphSnapshot['subgraphs'][number] {
  return {
    subgraph: new Subgraph({
      systemId,
      subgraphId: systemId + 1000,
      name: `sg-${systemId}`,
      isImported: false,
      fileSystemId: FILE_ID,
    }),
    requestedSgkvs,
    isMdf,
  };
}

function makeUsecase(
  systemId: number,
  subgraphSystemIds: readonly number[],
  valueSystemIds: readonly number[],
): UseCase {
  return new UseCase({
    systemId,
    fileSystemId: FILE_ID,
    keyVector: {valueSystemIds: [...valueSystemIds]},
    subgraphSystemIds: [...subgraphSystemIds],
    subgraphPairs: [],
  });
}

function makeContext(
  subgraphs: readonly RoutingGraphSnapshot['subgraphs'][number][],
  selectedUsecases: readonly UseCase[] = [],
): RoutingContext {
  return new RoutingContext(
    createAutoRoutingInput({
      fileSystemId: FILE_ID,
      selectedUsecases,
      requestPolicy: {
        requestedSubgraphSystemIds: new Set(
          subgraphs.map(entry => entry.subgraph.systemId),
        ),
        explicitlyExcludedSubgraphSystemIds: new Set(),
        explicitlyExcludedDataLinkSystemIds: new Set(),
        explicitlyExcludedControlLinkSystemIds: new Set(),
      },
      graphSnapshot: {
        subgraphs,
        routableDataLinks: [],
        routableControlLinks: [],
        overlayDataLinks: [],
        overlayControlLinks: [],
        committedUsecases: [],
        sessionEdits: emptyGraphEdits(),
      },
    }),
  );
}

function makeUnitOfWork(repository: SubgraphRepository): UnitOfWork {
  return {
    getSubgraphRepository: () => repository,
  } as unknown as UnitOfWork;
}

function createRepository(options: {
  readonly baseline: readonly {
    sgSystemId: number;
    sgkvSystemId: number;
    keyValues: readonly {
      keyDefSystemId: number;
      valueDefSystemId: number;
    }[];
  }[];
  readonly resolved: readonly {
    keyDefSystemId: number;
    valueDefSystemId: number;
  }[];
}) {
  return {
    getSgkvs: jest.fn().mockResolvedValue(options.baseline),
    resolveKeyValues: jest.fn().mockResolvedValue(options.resolved),
  } as unknown as SubgraphRepository;
}

describe('KvResolutionService', () => {
  it('uses every request-start selected UC in the baseline, including deletion-marked UCs', async () => {
    const sgA = makeSubgraph(10, [[101], [102]]);
    const sgB = makeSubgraph(20, []);
    const selected = makeUsecase(30, [10, 20], [101]);
    const deleted = makeUsecase(31, [10], [999]);
    const repository = createRepository({
      baseline: [
        {
          sgSystemId: 10,
          sgkvSystemId: 700,
          keyValues: [
            {keyDefSystemId: 501, valueDefSystemId: 101},
            {keyDefSystemId: 999, valueDefSystemId: 999},
          ],
        },
      ],
      resolved: [
        {keyDefSystemId: 501, valueDefSystemId: 101},
        {keyDefSystemId: 502, valueDefSystemId: 102},
      ],
    });
    const context = makeContext([sgA, sgB], [selected, deleted]);
    context.deletionAnalysis = {
      affectedUsecaseSystemIds: new Set([deleted.systemId]),
      markedForDeletion: [
        {
          usecase: deleted,
          deletedComponent: {type: 'SUBGRAPH', systemId: 10},
        },
      ],
      preservedUsecases: [],
      islandUseCaseCandidates: [],
      reconstructionPaths: [],
    };

    const result = await new KvResolutionService().run(
      context,
      makeUnitOfWork(repository),
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(repository.getSgkvs).toHaveBeenCalledTimes(1);
    expect(repository.getSgkvs).toHaveBeenCalledWith(FILE_ID, [10, 20]);
    expect(repository.resolveKeyValues).toHaveBeenCalledTimes(1);
    expect(repository.resolveKeyValues).toHaveBeenCalledWith(
      FILE_ID,
      [101, 102],
    );
    expect(context.kvResolutions?.ucFilteredBaseline.get(10)).toEqual([
      {
        keyValues: [
          {keyDefSystemId: 501, valueDefSystemId: 101},
          {keyDefSystemId: 999, valueDefSystemId: 999},
        ],
      },
    ]);
    expect(context.kvResolutions?.ucFilteredBaseline.get(20)).toEqual([]);
    expect(context.kvResolutions?.perSg.get(10)).toEqual([
      {keyValues: [{keyDefSystemId: 501, valueDefSystemId: 101}]},
      {keyValues: [{keyDefSystemId: 502, valueDefSystemId: 102}]},
    ]);
    expect(context.kvResolutions?.perSg.get(20)).toEqual([{keyValues: []}]);
    expect(context.kvResolutions).not.toEqual(
      expect.objectContaining({sgkvSystemId: expect.anything()}),
    );
  });

  it('accepts a same-file value absent from every persisted SGKV', async () => {
    const repository = createRepository({
      baseline: [],
      resolved: [{keyDefSystemId: 601, valueDefSystemId: 202}],
    });
    const context = makeContext([makeSubgraph(10, [[202]])]);

    const result = await new KvResolutionService().run(
      context,
      makeUnitOfWork(repository),
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(context.kvResolutions?.perSg.get(10)).toEqual([
      {keyValues: [{keyDefSystemId: 601, valueDefSystemId: 202}]},
    ]);
  });

  it('rejects duplicate values for one key and does not publish partial state', async () => {
    const repository = createRepository({
      baseline: [],
      resolved: [
        {keyDefSystemId: 601, valueDefSystemId: 201},
        {keyDefSystemId: 601, valueDefSystemId: 202},
      ],
    });
    const context = makeContext([makeSubgraph(10, [[201, 202]])]);

    const result = await new KvResolutionService().run(
      context,
      makeUnitOfWork(repository),
    );

    expect(result.kind).toBe(RESULT_KIND.Fail);
    expect(result).toEqual(
      expect.objectContaining({
        issues: [
          expect.objectContaining({
            code: 'ARC-ROUTING-SGKV-MALFORMED',
            impactedEntity: {entityType: 'Subgraph', systemId: 10},
          }),
        ],
      }),
    );
    expect(context.kvResolutions).toBeNull();
  });

  it('rejects unresolved or foreign values and does not publish partial state', async () => {
    const repository = createRepository({
      baseline: [],
      resolved: [{keyDefSystemId: 601, valueDefSystemId: 201}],
    });
    const context = makeContext([
      makeSubgraph(10, [[201]]),
      makeSubgraph(20, [[999]]),
    ]);

    const result = await new KvResolutionService().run(
      context,
      makeUnitOfWork(repository),
    );

    expect(result.kind).toBe(RESULT_KIND.Fail);
    expect(result).toEqual(
      expect.objectContaining({
        issues: [
          expect.objectContaining({
            code: 'ARC-ROUTING-SGKV-VALUE-NOT-FOUND',
            impactedEntity: {entityType: 'Subgraph', systemId: 20},
            message: expect.stringContaining('[999]'),
          }),
        ],
      }),
    );
    expect(context.kvResolutions).toBeNull();
  });

  it('uses an empty baseline when no usecases are selected and keeps explicit empty MDF input valid', async () => {
    const repository = createRepository({
      baseline: [
        {
          sgSystemId: 10,
          sgkvSystemId: 700,
          keyValues: [{keyDefSystemId: 601, valueDefSystemId: 201}],
        },
      ],
      resolved: [],
    });
    const context = makeContext([makeSubgraph(10, [], true)]);

    const result = await new KvResolutionService().run(
      context,
      makeUnitOfWork(repository),
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(context.kvResolutions?.ucFilteredBaseline.get(10)).toEqual([]);
    expect(context.kvResolutions?.perSg.get(10)).toEqual([{keyValues: []}]);
  });
});
