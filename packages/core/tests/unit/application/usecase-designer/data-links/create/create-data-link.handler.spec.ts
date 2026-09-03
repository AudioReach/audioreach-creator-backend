/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, jest, beforeEach} from '@jest/globals';
import {CreateDataLinkHandler} from '../../../../../../src/application/usecase-designer/data-links/create/create-data-link.handler.js';
import {CreateDataLinkCommand} from '../../../../../../src/application/usecase-designer/data-links/create/create-data-link.command.js';
import {ConflictException, DomainRuleViolationException} from '@arc/core';
import type {
  UnitOfWork,
  IdGenerationPort,
  DataLinkRepository,
  SubsystemRepository,
  ModuleRepository,
  PortIoType,
} from '@arc/core';

const FILE_ID = 10;
const GROUP_ID = 'test-group-uuid';
const SRC_MODULE = '201';
const DST_MODULE = '202';
const SRC_PORT = '301';
const DST_PORT = '302';

const PORT_IO_TYPE_OUT = 'OUTPUT' as PortIoType;
const PORT_IO_TYPE_IN = 'INPUT' as PortIoType;

function makeDataLinkEditRepo(
  findResult: {
    systemId: number;
    isDeleted: boolean;
    payload: Record<string, unknown>;
  } | null = null,
): DataLinkRepository {
  return {
    createDataLink: jest.fn().mockResolvedValue(undefined),
    findByPortPair: jest.fn().mockResolvedValue(findResult),
    reactivateDataLink: jest.fn().mockResolvedValue(undefined),
    createSubsystemDataLink: jest.fn().mockResolvedValue(undefined),
  } as unknown as DataLinkRepository;
}

function makeModuleRepo(
  overrides: {
    src?: {
      subgraphSystemId: number;
      ports: {systemId: number; portIoType: PortIoType}[];
    } | null;
    dst?: {
      subgraphSystemId: number;
      ports: {systemId: number; portIoType: PortIoType}[];
    } | null;
  } = {},
): ModuleRepository {
  const srcDefault = {
    subgraphSystemId: 11,
    ports: [{systemId: 301, portIoType: PORT_IO_TYPE_OUT}],
  };
  const dstDefault = {
    subgraphSystemId: 22,
    ports: [{systemId: 302, portIoType: PORT_IO_TYPE_IN}],
  };
  return {
    findModulePortsForLink: jest.fn().mockImplementation(async (id: number) => {
      if (id === 201)
        return overrides.src !== undefined ? overrides.src : srcDefault;
      if (id === 202)
        return overrides.dst !== undefined ? overrides.dst : dstDefault;
      return null;
    }),
    findModuleForPatch: jest.fn().mockResolvedValue(null),
  } as unknown as ModuleRepository;
}

function makeSubsystemRepo(subsystemIds: number[] = []): SubsystemRepository {
  return {
    subsystemExists: jest
      .fn()
      .mockImplementation(async (id: number) => subsystemIds.includes(id)),
    getAllNodesWithParents: jest.fn().mockResolvedValue(
      new Map<number, number | null>([
        [201, null],
        [202, null],
      ]),
    ),
    getPortIoType: jest.fn().mockResolvedValue(null),
    isPortOccupiedAsSource: jest.fn().mockResolvedValue(false),
    isPortOccupiedAsDest: jest.fn().mockResolvedValue(false),
  } as unknown as SubsystemRepository;
}

function makeUow(
  overrides: {
    dlEditRepo?: DataLinkRepository;
    subsystemRepo?: SubsystemRepository;
    moduleRepo?: ModuleRepository;
  } = {},
): UnitOfWork {
  return {
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    isInTransaction: jest.fn().mockReturnValue(true),
    getWriteContext: jest.fn().mockReturnValue({
      session: {sessionId: 1, fileSystemId: FILE_ID, mode: 'DESIGNER'},
      groupId: GROUP_ID,
    }),
    setWriteContext: jest.fn(),
    applyCachedActions: jest.fn().mockResolvedValue(undefined),
    getSessionRepository: jest.fn(),
    getBulkImportRepository: jest.fn(),
    getProjectRepository: jest.fn(),
    getValidationPreferencesRepository: jest.fn(),
    getValidationQueryService: jest.fn(),
    getModuleRepository: jest
      .fn()
      .mockReturnValue(overrides.moduleRepo ?? makeModuleRepo()),
    getContainerRepository: jest.fn(),
    getModuleDefinitionRepository: jest.fn(),
    getDataLinkRepository: jest
      .fn()
      .mockReturnValue(overrides.dlEditRepo ?? makeDataLinkEditRepo()),
    getControlLinkRepository: jest.fn(),
    getSubgraphRepository: jest.fn(),
    getSubsystemRepository: jest
      .fn()
      .mockReturnValue(overrides.subsystemRepo ?? makeSubsystemRepo()),
    getPropertyDefinitionsRepository: jest.fn(),
  } as unknown as UnitOfWork;
}

let idSeq = 500;
function makeIdGen(): IdGenerationPort {
  return {
    getNextId: jest.fn().mockImplementation(() => Promise.resolve(idSeq++)),
  } as unknown as IdGenerationPort;
}

describe('CreateDataLinkHandler', () => {
  beforeEach(() => {
    idSeq = 500;
  });

  it('creates a DataLink and returns UseCaseComponentsReadModel with one dataLink', async () => {
    const dlRepo = makeDataLinkEditRepo(null);
    const uow = makeUow({dlEditRepo: dlRepo});
    const handler = new CreateDataLinkHandler(uow, makeIdGen());

    const result = await handler.handle(
      new CreateDataLinkCommand(SRC_MODULE, SRC_PORT, DST_MODULE, DST_PORT),
    );

    expect(dlRepo.createDataLink).toHaveBeenCalledTimes(1);
    expect(uow.commit as ReturnType<typeof jest.fn>).toHaveBeenCalled();
    expect(result.dataLinks).toHaveLength(1);
    expect(result.dataLinks[0].sourcePortId).toBe(301);
    expect(result.dataLinks[0].destinationPortId).toBe(302);
  });

  it('throws ConflictException (409) when an active DataLink already exists for the port pair', async () => {
    const dlRepo = makeDataLinkEditRepo({
      systemId: 999,
      isDeleted: false,
      payload: {},
    });
    const uow = makeUow({dlEditRepo: dlRepo});
    const handler = new CreateDataLinkHandler(uow, makeIdGen());

    await expect(
      handler.handle(
        new CreateDataLinkCommand(SRC_MODULE, SRC_PORT, DST_MODULE, DST_PORT),
      ),
    ).rejects.toThrow('already exists');
  });

  it('calls reactivateDataLink and not createDataLink when a soft-deleted link exists (FR-DL-07a)', async () => {
    const dlRepo = makeDataLinkEditRepo({
      systemId: 888,
      isDeleted: true,
      payload: {
        sourcePortSystemId: 301,
        destinationPortSystemId: 302,
        fileSystemId: FILE_ID,
      },
    });
    const uow = makeUow({dlEditRepo: dlRepo});
    const handler = new CreateDataLinkHandler(uow, makeIdGen());

    await handler.handle(
      new CreateDataLinkCommand(SRC_MODULE, SRC_PORT, DST_MODULE, DST_PORT),
    );

    expect(dlRepo.reactivateDataLink).toHaveBeenCalledTimes(1);
  });

  it('throws DomainRuleViolationException (422) when source === destination module (self-loop, FR-DL-06)', async () => {
    const handler = new CreateDataLinkHandler(makeUow(), makeIdGen());
    await expect(
      handler.handle(
        new CreateDataLinkCommand(SRC_MODULE, SRC_PORT, SRC_MODULE, DST_PORT),
      ),
    ).rejects.toThrow('must differ');
  });

  // ── FR-DL-02/03/04/05 validations ────────────────────────────────────────

  it('throws ResourceNotFoundException (404) when source module does not exist (FR-DL-03)', async () => {
    const moduleRepo = makeModuleRepo({src: null});
    const handler = new CreateDataLinkHandler(
      makeUow({moduleRepo}),
      makeIdGen(),
    );
    await expect(
      handler.handle(
        new CreateDataLinkCommand(SRC_MODULE, SRC_PORT, DST_MODULE, DST_PORT),
      ),
    ).rejects.toThrow('not found');
  });

  it('throws DomainRuleViolationException (422) when source is a subsystem node (FR-DL-02)', async () => {
    const moduleRepo = makeModuleRepo({src: null});
    const subsysRepo = makeSubsystemRepo([201]);
    const handler = new CreateDataLinkHandler(
      makeUow({moduleRepo, subsystemRepo: subsysRepo}),
      makeIdGen(),
    );
    await expect(
      handler.handle(
        new CreateDataLinkCommand(SRC_MODULE, SRC_PORT, DST_MODULE, DST_PORT),
      ),
    ).rejects.toThrow('subsystem');
  });

  it('throws DomainRuleViolationException (422) when source port direction is not OUTPUT (FR-DL-04)', async () => {
    const moduleRepo = makeModuleRepo({
      src: {
        subgraphSystemId: 11,
        ports: [{systemId: 301, portIoType: PORT_IO_TYPE_IN}],
      },
    });
    const handler = new CreateDataLinkHandler(
      makeUow({moduleRepo}),
      makeIdGen(),
    );
    await expect(
      handler.handle(
        new CreateDataLinkCommand(SRC_MODULE, SRC_PORT, DST_MODULE, DST_PORT),
      ),
    ).rejects.toThrow('OUTPUT');
  });

  it('throws DomainRuleViolationException (422) when dest port direction is not INPUT (FR-DL-04)', async () => {
    const moduleRepo = makeModuleRepo({
      dst: {
        subgraphSystemId: 22,
        ports: [{systemId: 302, portIoType: PORT_IO_TYPE_OUT}],
      },
    });
    const handler = new CreateDataLinkHandler(
      makeUow({moduleRepo}),
      makeIdGen(),
    );
    await expect(
      handler.handle(
        new CreateDataLinkCommand(SRC_MODULE, SRC_PORT, DST_MODULE, DST_PORT),
      ),
    ).rejects.toThrow('INPUT');
  });

  it('throws DomainRuleViolationException (422) when source port does not belong to source module (FR-DL-05)', async () => {
    const moduleRepo = makeModuleRepo({
      src: {
        subgraphSystemId: 11,
        ports: [{systemId: 999, portIoType: PORT_IO_TYPE_OUT}],
      },
    });
    const handler = new CreateDataLinkHandler(
      makeUow({moduleRepo}),
      makeIdGen(),
    );
    await expect(
      handler.handle(
        new CreateDataLinkCommand(SRC_MODULE, SRC_PORT, DST_MODULE, DST_PORT),
      ),
    ).rejects.toThrow('ownership');
  });
});
