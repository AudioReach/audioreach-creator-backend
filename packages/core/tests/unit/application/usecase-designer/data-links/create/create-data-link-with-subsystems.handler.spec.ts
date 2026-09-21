/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, jest, beforeEach} from '@jest/globals';
import {CreateDataLinkWithSubsystemsHandler} from '../../../../../../src/application/usecase-designer/data-links/create/create-data-link-with-subsystems.handler.js';
import {CreateDataLinkWithSubsystemsCommand} from '../../../../../../src/application/usecase-designer/data-links/create/create-data-link-with-subsystems.command.js';
import type {
  UnitOfWork,
  IdGenerationPort,
  DataLinkRepository,
  SubsystemRepository,
  ModuleRepository,
  PortIoType,
} from '@arc/core';
import {DATA_LINK_TYPE} from '@arc/core';

const FILE_ID = 10;
const GROUP_ID = 'gid';
const MOD_A = '201';
const MOD_B = '202';
const SUBSYS_A = '501';
const PORT_SRC = '301';
const PORT_DST = '302';
const PORT_SUBSYS_OUT = '401';

function makeDlEditRepo(): DataLinkRepository {
  return {
    createDataLink: jest.fn().mockResolvedValue(undefined),
    findByPortPair: jest.fn().mockResolvedValue(null),
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
    ports: [{systemId: 301, portIoType: 'OUTPUT' as PortIoType}],
  };
  const dstDefault = {
    subgraphSystemId: 22,
    ports: [{systemId: 302, portIoType: 'INPUT' as PortIoType}],
  };
  return {
    findModulePortsForLink: jest.fn().mockImplementation(async (id: number) => {
      if (id === Number(MOD_A))
        return overrides.src !== undefined ? overrides.src : srcDefault;
      if (id === Number(MOD_B))
        return overrides.dst !== undefined ? overrides.dst : dstDefault;
      return null;
    }),
    findModuleForPatch: jest.fn(),
  } as unknown as ModuleRepository;
}

function makeSubsystemRepo(subsystemIds: number[] = []): SubsystemRepository {
  return {
    subsystemExists: jest
      .fn()
      .mockImplementation(async (id: number) => subsystemIds.includes(id)),
    getAllNodesWithParents: jest.fn().mockResolvedValue([
      {systemId: 201, parentSystemId: null, type: 'module'},
      {systemId: 202, parentSystemId: null, type: 'module'},
    ]),
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
      session: {sessionId: 1, fileSystemId: FILE_ID},
      groupId: GROUP_ID,
    }),
    setWriteContext: jest.fn(),
    applyCachedActions: jest.fn(),
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
      .mockReturnValue(overrides.dlEditRepo ?? makeDlEditRepo()),
    getControlLinkRepository: jest.fn(),
    getSubgraphRepository: jest.fn().mockReturnValue({
      getUsecaseSystemIdForSubgraph: jest.fn().mockResolvedValue(100),
    }),
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

describe('CreateDataLinkWithSubsystemsHandler', () => {
  beforeEach(() => {
    idSeq = 500;
  });

  // ── Self-loop check ──────────────────────────────────────────────────────

  it('throws 422 when source === dest node (self-loop, FR-DLS-04)', async () => {
    const handler = new CreateDataLinkWithSubsystemsHandler(
      makeUow(),
      makeIdGen(),
    );
    await expect(
      handler.handle(
        new CreateDataLinkWithSubsystemsCommand(
          DATA_LINK_TYPE.Normal,
          MOD_A,
          PORT_SRC,
          MOD_A,
          PORT_DST,
        ),
      ),
    ).rejects.toThrow('must differ');
  });

  // ── linkType topology validation ─────────────────────────────────────────

  it('throws 422 when INTER_USECASE endpoints share a usecase', async () => {
    const handler = new CreateDataLinkWithSubsystemsHandler(
      makeUow(),
      makeIdGen(),
    );
    await expect(
      handler.handle(
        new CreateDataLinkWithSubsystemsCommand(
          DATA_LINK_TYPE.InterUsecase,
          MOD_A,
          PORT_SRC,
          MOD_B,
          PORT_DST,
        ),
      ),
    ).rejects.toThrow('same usecase');
  });

  // ── Branch A (both module endpoints, FR-DLS-10) ──────────────────────────

  describe('handleModuleLinks (both module endpoints, FR-DLS-10)', () => {
    it('calls createDataLink, returns dataLinks empty, does not throw', async () => {
      const dlRepo = makeDlEditRepo();
      const moduleRepo = makeModuleRepo();
      const subsysRepo = makeSubsystemRepo([]);
      const uow = makeUow({
        dlEditRepo: dlRepo,
        subsystemRepo: subsysRepo,
        moduleRepo,
      });
      const handler = new CreateDataLinkWithSubsystemsHandler(uow, makeIdGen());

      const result = await handler.handle(
        new CreateDataLinkWithSubsystemsCommand(
          DATA_LINK_TYPE.Normal,
          MOD_A,
          PORT_SRC,
          MOD_B,
          PORT_DST,
        ),
      );

      expect(dlRepo.createDataLink).toHaveBeenCalledTimes(1);
      expect(result.dataLinks).toHaveLength(0);
    });

    it('throws 409 when duplicate active DataLink exists (Branch A)', async () => {
      const dlRepo = makeDlEditRepo();
      (dlRepo.findByPortPair as ReturnType<typeof jest.fn>).mockResolvedValue({
        systemId: 1,
        isDeleted: false,
        payload: {},
      });
      const moduleRepo = makeModuleRepo();
      const subsysRepo = makeSubsystemRepo([]);
      const handler = new CreateDataLinkWithSubsystemsHandler(
        makeUow({dlEditRepo: dlRepo, subsystemRepo: subsysRepo, moduleRepo}),
        makeIdGen(),
      );
      await expect(
        handler.handle(
          new CreateDataLinkWithSubsystemsCommand(
            DATA_LINK_TYPE.Normal,
            MOD_A,
            PORT_SRC,
            MOD_B,
            PORT_DST,
          ),
        ),
      ).rejects.toThrow('already exists');
    });

    it('throws 422 when source port direction is wrong (FR-DLS-05)', async () => {
      const moduleRepo = makeModuleRepo({
        src: {
          subgraphSystemId: 11,
          ports: [{systemId: 301, portIoType: 'INPUT' as PortIoType}],
        },
      });
      const subsysRepo = makeSubsystemRepo([]);
      const handler = new CreateDataLinkWithSubsystemsHandler(
        makeUow({subsystemRepo: subsysRepo, moduleRepo}),
        makeIdGen(),
      );
      await expect(
        handler.handle(
          new CreateDataLinkWithSubsystemsCommand(
            DATA_LINK_TYPE.Normal,
            MOD_A,
            PORT_SRC,
            MOD_B,
            PORT_DST,
          ),
        ),
      ).rejects.toThrow('OUTPUT');
    });

    it('creates a cross-subsystem SLS chain when module endpoints belong to different subsystems (FR-DL-11/FR-DLS-10)', async () => {
      const dlRepo = makeDlEditRepo();
      const moduleRepo = makeModuleRepo();
      const subsysRepo = {
        subsystemExists: jest.fn().mockResolvedValue(false),
        getAllNodesWithParents: jest.fn().mockResolvedValue([
          {systemId: Number(MOD_A), parentSystemId: 501, type: 'module'},
          {systemId: Number(MOD_B), parentSystemId: 502, type: 'module'},
          {systemId: 501, parentSystemId: null, type: 'subsystem'},
          {systemId: 502, parentSystemId: null, type: 'subsystem'},
        ]),
        getPortIoType: jest.fn(),
        isPortOccupiedAsSource: jest.fn(),
        isPortOccupiedAsDest: jest.fn(),
      } as unknown as SubsystemRepository;
      const uow = makeUow({
        dlEditRepo: dlRepo,
        subsystemRepo: subsysRepo,
        moduleRepo,
      });
      const handler = new CreateDataLinkWithSubsystemsHandler(uow, makeIdGen());

      await handler.handle(
        new CreateDataLinkWithSubsystemsCommand(
          DATA_LINK_TYPE.Normal,
          MOD_A,
          PORT_SRC,
          MOD_B,
          PORT_DST,
        ),
      );

      expect(dlRepo.createDataLink).toHaveBeenCalledTimes(1);
      const [dataLinkArg] = (
        dlRepo.createDataLink as ReturnType<typeof jest.fn>
      ).mock.calls[0];
      expect(dataLinkArg.subsystemDataLinks.length).toBeGreaterThan(0);
    });
  });

  // ── Branch B (subsystem endpoint, FR-DLS-11) ────────────────────────────

  describe('handleSubsystemLinks (subsystem endpoint, FR-DLS-11)', () => {
    it('calls createSubsystemDataLink and not createDataLink when source is subsystem', async () => {
      const dlRepo = makeDlEditRepo();
      const subsysRepo = makeSubsystemRepo([Number(SUBSYS_A)]);
      (
        subsysRepo.getPortIoType as ReturnType<typeof jest.fn>
      ).mockResolvedValue('INPUT_OUTPUT');
      const uow = makeUow({dlEditRepo: dlRepo, subsystemRepo: subsysRepo});
      const handler = new CreateDataLinkWithSubsystemsHandler(uow, makeIdGen());

      const result = await handler.handle(
        new CreateDataLinkWithSubsystemsCommand(
          DATA_LINK_TYPE.Normal,
          SUBSYS_A,
          PORT_SUBSYS_OUT,
          MOD_B,
          PORT_DST,
        ),
      );

      expect(dlRepo.createSubsystemDataLink).toHaveBeenCalledTimes(1);
      expect(dlRepo.createDataLink).not.toHaveBeenCalled();
      expect(result.dataLinks).toHaveLength(1);
      expect(result.dataLinks[0].sourceSystemId).toBe(SUBSYS_A);
    });

    it('stores linkType on the created SLS when one endpoint is a subsystem (FR-DLS-11)', async () => {
      const dlRepo = makeDlEditRepo();
      const subsysRepo = makeSubsystemRepo([Number(SUBSYS_A)]);
      (
        subsysRepo.getPortIoType as ReturnType<typeof jest.fn>
      ).mockResolvedValue('INPUT_OUTPUT');
      const handler = new CreateDataLinkWithSubsystemsHandler(
        makeUow({dlEditRepo: dlRepo, subsystemRepo: subsysRepo}),
        makeIdGen(),
      );

      const result = await handler.handle(
        new CreateDataLinkWithSubsystemsCommand(
          DATA_LINK_TYPE.InterUsecase,
          SUBSYS_A,
          PORT_SUBSYS_OUT,
          MOD_B,
          PORT_DST,
        ),
      );

      expect(dlRepo.createSubsystemDataLink).toHaveBeenCalledTimes(1);
      const [slsArg] = (
        dlRepo.createSubsystemDataLink as ReturnType<typeof jest.fn>
      ).mock.calls[0];
      expect(slsArg.linkType).toBe(DATA_LINK_TYPE.InterUsecase);
      expect(result.dataLinks).toHaveLength(1);
      expect(result.dataLinks[0].linkType).toBe(DATA_LINK_TYPE.InterUsecase);
    });

    it('throws 422 when source subsystem port is already occupied as source (FR-DLS-07)', async () => {
      const dlRepo = makeDlEditRepo();
      const subsysRepo = makeSubsystemRepo([Number(SUBSYS_A)]);
      (
        subsysRepo.getPortIoType as ReturnType<typeof jest.fn>
      ).mockResolvedValue('INPUT_OUTPUT');
      (
        subsysRepo.isPortOccupiedAsSource as ReturnType<typeof jest.fn>
      ).mockResolvedValue(true);
      const handler = new CreateDataLinkWithSubsystemsHandler(
        makeUow({dlEditRepo: dlRepo, subsystemRepo: subsysRepo}),
        makeIdGen(),
      );
      await expect(
        handler.handle(
          new CreateDataLinkWithSubsystemsCommand(
            DATA_LINK_TYPE.Normal,
            SUBSYS_A,
            PORT_SUBSYS_OUT,
            MOD_B,
            PORT_DST,
          ),
        ),
      ).rejects.toThrow('occupied');
    });

    it('throws 422 when source subsystem port has wrong portIoType (FR-DLS-08)', async () => {
      const dlRepo = makeDlEditRepo();
      const subsysRepo = makeSubsystemRepo([Number(SUBSYS_A)]);
      (
        subsysRepo.getPortIoType as ReturnType<typeof jest.fn>
      ).mockResolvedValue('OUTPUT');
      const handler = new CreateDataLinkWithSubsystemsHandler(
        makeUow({dlEditRepo: dlRepo, subsystemRepo: subsysRepo}),
        makeIdGen(),
      );
      await expect(
        handler.handle(
          new CreateDataLinkWithSubsystemsCommand(
            DATA_LINK_TYPE.Normal,
            SUBSYS_A,
            PORT_SUBSYS_OUT,
            MOD_B,
            PORT_DST,
          ),
        ),
      ).rejects.toThrow('InputOutput');
    });
  });
});
