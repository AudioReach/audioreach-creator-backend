/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import {LINK_DELETION_MODE} from '@arc/core';
import {DomainRuleViolationException} from '../../../../../../src/shared/exceptions/domain-rule-violation.exception.js';
import type {UnitOfWork} from '../../../../../../src/application/ports/persistence/unit-of-work.js';
import {DataLinkDeletionService} from '../../../../../../src/application/usecase-designer/data-links/delete/data-link-deletion.service.js';
import {ControlLinkDeletionService} from '../../../../../../src/application/usecase-designer/control-links/delete/control-link-deletion.service.js';
import {ModuleDeletionService} from '../../../../../../src/application/usecase-designer/spf-module/delete/module-deletion.service.js';

function createFixture(options?: {
  imported?: boolean;
  missingModule?: boolean;
  remainingModules?: number[];
  hasSubsystems?: boolean;
  dataLinks?: Array<{
    systemId: number;
    subsystemDataLinks: Array<{systemId: number}>;
  }>;
  controlLinks?: Array<{
    systemId: number;
    subsystemControlLinks: Array<{systemId: number}>;
  }>;
  unresolvedDataLinks?: Array<{systemId: number}>;
  unresolvedControlLinks?: Array<{systemId: number}>;
}) {
  const moduleRepository = {
    findModuleById: jest.fn().mockResolvedValue(
      options?.missingModule
        ? null
        : {
            systemId: 100,
            alias: 'module-a',
            definitionSystemId: 10,
            containerSystemId: 200,
            subgraphSystemId: 300,
          },
    ),
    findModulesByContainerId: jest.fn().mockResolvedValue(
      (options?.remainingModules ?? []).map(systemId => ({
        systemId,
        definitionSystemId: 10,
        containerSystemId: 200,
        subgraphSystemId: 300,
      })),
    ),
    findModulesBySubgraphId: jest.fn().mockResolvedValue(
      (options?.remainingModules ?? []).map(systemId => ({
        systemId,
        definitionSystemId: 10,
        containerSystemId: 200,
        subgraphSystemId: 300,
      })),
    ),
    getModulesWithStackSizeByContainer: jest
      .fn()
      .mockResolvedValue([{moduleSystemId: 101, stackSize: 12}]),
    deleteModule: jest.fn(),
  };
  const containerRepository = {
    deleteContainer: jest.fn(),
    setPropertyData: jest.fn(),
    getPropertyDefinitionByPropertyId: jest.fn().mockResolvedValue({
      systemId: 900,
      fileSystemId: 7,
      propertyId: 0x08_00_10_13,
      name: 'Stack Size',
      description: undefined,
      maxSize: 4,
      type: 'SPF',
      elementsStructure: '',
    }),
  };
  const subgraphRepository = {
    findByIds: jest.fn().mockResolvedValue([
      {
        systemId: 300,
        subgraphId: 1,
        name: 'sg',
        isImported: options?.imported ?? false,
        fileSystemId: 7,
      },
    ]),
    deleteSubgraph: jest.fn(),
  };
  const dataLinkRepository = {
    findLinksConnectedToModule: jest
      .fn()
      .mockResolvedValue(options?.dataLinks ?? []),
    findUnresolvedSubsystemLinksFromModule: jest
      .fn()
      .mockResolvedValue(options?.unresolvedDataLinks ?? []),
    findSubsystemDataRouteContext: jest.fn().mockResolvedValue({
      subsystemDataLinks: [],
      nodeTypeBySystemId: new Map(),
    }),
    deleteAggregate: jest.fn(),
    deleteSubsystemDataLinks: jest.fn(),
  };
  const controlLinkRepository = {
    findLinksConnectedToModule: jest
      .fn()
      .mockResolvedValue(options?.controlLinks ?? []),
    findUnresolvedSubsystemLinksFromModule: jest
      .fn()
      .mockResolvedValue(options?.unresolvedControlLinks ?? []),
    findSubsystemControlRouteContext: jest.fn().mockResolvedValue({
      subsystemControlLinks: [],
      nodeTypeBySystemId: new Map(),
    }),
    deleteAggregate: jest.fn(),
    deleteSubsystemControlLinks: jest.fn(),
  };
  const subsystemRepository = {
    hasSubsystems: jest.fn().mockResolvedValue(options?.hasSubsystems ?? false),
    clearControlPortIntents: jest.fn(),
  };
  const usecaseRepository = {
    removeSubgraphReferences: jest
      .fn()
      .mockResolvedValue({affectedUseCaseSystemIds: [500]}),
  };
  const uow = {
    getModuleRepository: () => moduleRepository,
    getContainerRepository: () => containerRepository,
    getSubgraphRepository: () => subgraphRepository,
    getDataLinkRepository: () => dataLinkRepository,
    getControlLinkRepository: () => controlLinkRepository,
    getSubsystemRepository: () => subsystemRepository,
    getUsecaseRepository: () => usecaseRepository,
  } as unknown as UnitOfWork;

  return {
    service: new ModuleDeletionService(uow),
    uow,
    moduleRepository,
    containerRepository,
    subgraphRepository,
    usecaseRepository,
    dataLinkRepository,
    controlLinkRepository,
  };
}

describe('ModuleDeletionService', () => {
  it('passes the requested link deletion mode to both link services', async () => {
    const dataSpy = jest
      .spyOn(DataLinkDeletionService.prototype, 'deleteConnected')
      .mockResolvedValue({dataLinks: [], unresolvedSubsystemDataLinks: []});
    const controlSpy = jest
      .spyOn(ControlLinkDeletionService.prototype, 'deleteConnected')
      .mockResolvedValue({
        controlLinks: [],
        unresolvedSubsystemControlLinks: [],
        ssIntentsClearedPorts: [],
      });
    const fixture = createFixture();

    try {
      await fixture.service.deleteModule(
        100,
        7,
        LINK_DELETION_MODE.SegmentOnly,
      );

      expect(dataSpy).toHaveBeenCalledWith(
        100,
        7,
        LINK_DELETION_MODE.SegmentOnly,
      );
      expect(controlSpy).toHaveBeenCalledWith(
        100,
        7,
        LINK_DELETION_MODE.SegmentOnly,
      );
    } finally {
      dataSpy.mockRestore();
      controlSpy.mockRestore();
    }
  });

  it('deletes the module and empty container/subgraph with sorted response IDs', async () => {
    const fixture = createFixture();

    const result = await fixture.service.deleteModule(100, 7);

    expect(result.response).toEqual({
      deleted: {
        spfModules: [{systemId: '100'}],
        subgraphs: [{systemId: '300'}],
        containers: [{systemId: '200'}],
        dataLinks: [],
        controlLinks: [],
      },
      updated: {containers: [], usecases: [{systemId: '500'}]},
    });
    expect(fixture.moduleRepository.deleteModule).toHaveBeenCalledWith(100, 7);
    expect(fixture.containerRepository.deleteContainer).toHaveBeenCalledWith(
      200,
      7,
    );
    expect(fixture.subgraphRepository.deleteSubgraph).toHaveBeenCalledWith(
      300,
      7,
    );
    expect(
      fixture.usecaseRepository.removeSubgraphReferences,
    ).toHaveBeenCalledWith(300, 7);
  });

  it('recalculates a surviving container and leaves a non-empty subgraph', async () => {
    const fixture = createFixture({remainingModules: [101]});

    const result = await fixture.service.deleteModule(100, 7);

    expect(fixture.containerRepository.deleteContainer).not.toHaveBeenCalled();
    expect(fixture.containerRepository.setPropertyData).toHaveBeenCalledWith(
      200,
      900,
      expect.any(Uint8Array),
    );
    expect(fixture.subgraphRepository.deleteSubgraph).not.toHaveBeenCalled();
    expect(
      fixture.usecaseRepository.removeSubgraphReferences,
    ).not.toHaveBeenCalled();
    expect(result.response).toMatchObject({
      deleted: {containers: []},
      updated: {
        containers: [{systemId: '200', stackSize: 12}],
        usecases: [],
      },
    });
  });

  it('rejects modules belonging to imported subgraphs before writing', async () => {
    const fixture = createFixture({imported: true});

    const rejection = fixture.service.deleteModule(100, 7);
    await expect(rejection).rejects.toBeInstanceOf(
      DomainRuleViolationException,
    );
    await expect(rejection).rejects.toMatchObject({
      issues: [expect.objectContaining({code: 'ARC-MOD-SUBGRAPH-IMPORTED'})],
    });
    expect(fixture.moduleRepository.deleteModule).not.toHaveBeenCalled();
  });

  it('reports a not-found issue for an effectively missing module', async () => {
    const fixture = createFixture({missingModule: true});

    await expect(fixture.service.deleteModule(100, 7)).rejects.toMatchObject({
      issues: [
        expect.objectContaining({
          code: 'ENTITY_NOT_FOUND',
          impactedEntity: {entityType: 'SpfModule', systemId: 100},
        }),
      ],
    });
  });

  it('reports deduplicated, sorted subsystem link summaries', async () => {
    const fixture = createFixture({
      hasSubsystems: true,
      dataLinks: [
        {systemId: 20, subsystemDataLinks: [{systemId: 202}, {systemId: 201}]},
        {systemId: 10, subsystemDataLinks: [{systemId: 102}]},
        {systemId: 20, subsystemDataLinks: [{systemId: 202}]},
      ],
      controlLinks: [
        {systemId: 30, subsystemControlLinks: [{systemId: 301}]},
        {systemId: 30, subsystemControlLinks: [{systemId: 301}]},
      ],
      unresolvedDataLinks: [{systemId: 402}, {systemId: 401}, {systemId: 402}],
      unresolvedControlLinks: [{systemId: 502}, {systemId: 501}],
    });

    const result = await fixture.service.deleteModule(100, 7);

    expect(result.response.deleted).toMatchObject({
      dataLinks: [
        {systemId: '10', subsystemLinks: [{systemId: '102'}]},
        {
          systemId: '20',
          subsystemLinks: [{systemId: '201'}, {systemId: '202'}],
        },
      ],
      controlLinks: [{systemId: '30', subsystemLinks: [{systemId: '301'}]}],
      unresolvedSubsystemDataLinks: [{systemId: '401'}, {systemId: '402'}],
      unresolvedSubsystemControlLinks: [{systemId: '501'}, {systemId: '502'}],
    });
  });

  it('deletes canonical link aggregates and raw-deletes only unresolved segments', async () => {
    const fixture = createFixture({
      dataLinks: [{systemId: 10, subsystemDataLinks: [{systemId: 101}]}],
      controlLinks: [{systemId: 20, subsystemControlLinks: [{systemId: 201}]}],
      unresolvedDataLinks: [{systemId: 102}],
      unresolvedControlLinks: [{systemId: 202}],
    });

    await fixture.service.deleteModule(100, 7);

    expect(fixture.dataLinkRepository.deleteAggregate).toHaveBeenCalledWith(
      10,
      7,
    );
    expect(
      fixture.dataLinkRepository.deleteSubsystemDataLinks,
    ).toHaveBeenCalledWith([102], 7);
    expect(fixture.controlLinkRepository.deleteAggregate).toHaveBeenCalledWith(
      20,
      7,
    );
    expect(
      fixture.controlLinkRepository.deleteSubsystemControlLinks,
    ).toHaveBeenCalledWith([202], 7);
  });
});
