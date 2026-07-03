/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {EntityBuilderService} from '../../../../src/application/file-operations/upload-file/services/entity-builder-service.js';
import type {NaturalIdGenerationPort} from '../../../../src/application/ports/id-generation/natural-id-generation.port.js';
import {NaturalIdType} from '../../../../src/domain/services/natural-id-generator/natural-id-type.js';
import type {IdGenerationPort} from '../../../../src/application/ports/id-generation/id-generation.port.js';
import type {ForeignKeyMapper} from '../../../../src/application/file-operations/upload-file/services/foreign-key-mapper.js';

function makeIdGeneratorStub(): IdGenerationPort {
  return {
    getNextId: jest.fn().mockResolvedValue(1),
    reserveBlock: jest.fn().mockResolvedValue(1),
    persistLastUsedId: jest.fn().mockResolvedValue(undefined),
  };
}

function makeForeignKeyMapperStub(): ForeignKeyMapper {
  return {} as unknown as ForeignKeyMapper;
}

function makeNaturalIdPortMock(): NaturalIdGenerationPort {
  return {
    registerBatch: jest.fn(),
    getNextId: jest.fn().mockReturnValue(1),
  } as unknown as NaturalIdGenerationPort;
}

describe('EntityBuilderService — registerNaturalIds', () => {
  it('calls registerBatch with subgraph, container and module entries', () => {
    const naturalIdPort = makeNaturalIdPortMock();
    const service = new EntityBuilderService(
      makeIdGeneratorStub(),
      naturalIdPort,
      makeForeignKeyMapperStub(),
    );

    const fakeSubgraphs = [{subgraphId: 0xb0000001}] as any[];
    const fakeContainers = [{containerId: 0xe0000001}] as any[];
    const fakeModules = [{instanceId: 0x00004001}] as any[];

    service.registerNaturalIds(42, fakeSubgraphs, fakeContainers, fakeModules);

    expect(naturalIdPort.registerBatch).toHaveBeenCalledTimes(1);
    expect(naturalIdPort.registerBatch).toHaveBeenCalledWith(
      42,
      expect.arrayContaining([
        {type: NaturalIdType.SUBGRAPH, id: 0xb0000001},
        {type: NaturalIdType.CONTAINER, id: 0xe0000001},
        {type: NaturalIdType.MODINSTANCE, id: 0x00004001},
      ]),
    );
  });

  it('calls registerBatch with empty array when no entities built', () => {
    const naturalIdPort = makeNaturalIdPortMock();
    const service = new EntityBuilderService(
      makeIdGeneratorStub(),
      naturalIdPort,
      makeForeignKeyMapperStub(),
    );

    service.registerNaturalIds(99, [], [], []);

    expect(naturalIdPort.registerBatch).toHaveBeenCalledWith(99, []);
  });
});
