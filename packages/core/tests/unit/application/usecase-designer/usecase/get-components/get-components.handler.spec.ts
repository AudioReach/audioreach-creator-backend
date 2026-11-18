/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import {GetComponentsHandler} from '../../../../../../src/application/usecase-designer/usecase/get-components/get-components.handler.js';
import {
  GetComponentsQuery,
  COMPONENT_SCOPE_TYPE,
  type ComponentFlatScope,
} from '../../../../../../src/application/usecase-designer/usecase/get-components/get-components.query.js';
import type {ComponentCollectionDto} from '../../../../../../src/application/usecase-designer/usecase/dto/component-collection-dto.js';
import type {QueryServices} from '../../../../../../src/application/ports/persistence/query-services/query-services.js';
import type {SpfModuleReadModel} from '../../../../../../src/application/ports/persistence/query-services/spf-module/spf-module-read-model.js';
import type {DataLinkReadModel} from '../../../../../../src/application/ports/persistence/query-services/link/data-link-read-model.js';
import type {ControlLinkReadModel} from '../../../../../../src/application/ports/persistence/query-services/link/control-link-read-model.js';
import {UseCaseReadModel} from '../../../../../../src/application/ports/persistence/query-services/usecase/query-models/usecase-read-model.js';
import {
  Result,
  RESULT_KIND,
} from '../../../../../../src/application/shared/result/result.js';
import {IssueFactory} from '../../../../../../src/shared/issues/factories.js';
import {DATA_LINK_TYPE} from '../../../../../../src/domain/entities/usecase-data/links/data-link-type.js';
import {CONTROL_LINK_TYPE} from '../../../../../../src/domain/entities/usecase-data/links/control-link-type.js';
import {ENTITY_TYPE} from '../../../../../../src/shared/entity-type.js';

const PROJECT_ID = 1;
const FILE_ID = 2;
const SUBGRAPH_ID = 3;
const USECASE_ID = 7;

function makeModule(
  systemId: number,
  subgraphSystemId = SUBGRAPH_ID,
  parentSystemId: number | null = null,
): SpfModuleReadModel {
  return {
    systemId,
    parentSystemId,
    naturalId: systemId,
    alias: `module_${systemId}`,
    definitionSystemId: systemId + 1000,
    name: `Module ${systemId}`,
    moduleDefinitionNaturalId: systemId,
    subgraphSystemId,
    containerSystemId: 10,
    maxInputPortsSupported: 4,
    maxOutputPortsSupported: 4,
    maxControlPortsSupported: 4,
    dataPorts: [],
    controlPorts: [],
  };
}

function makeDataLink(
  systemId: number,
  sourceNodeSystemId: number,
  destinationNodeSystemId: number,
): DataLinkReadModel {
  return {
    systemId,
    sourceNodeSystemId,
    destinationNodeSystemId,
    sourcePortSystemId: systemId + 1000,
    destinationPortSystemId: systemId + 2000,
    linkType: DATA_LINK_TYPE.Normal,
  };
}

function makeControlLink(
  systemId: number,
  peerNodeASystemId: number,
  peerNodeBSystemId: number,
): ControlLinkReadModel {
  return {
    systemId,
    peerNodeASystemId,
    peerNodeBSystemId,
    nodeAPortSystemId: systemId + 3000,
    nodeBPortSystemId: systemId + 4000,
    heapId: 0,
    linkType: CONTROL_LINK_TYPE.Normal,
  };
}

type ComponentResults = {
  modules: Result<SpfModuleReadModel[]>;
  dataLinks: DataLinkReadModel[];
  controlLinks: ControlLinkReadModel[];
};

function makeServices(
  overrides: Partial<ComponentResults> = {},
): QueryServices {
  const {
    modules = Result.ok([makeModule(101), makeModule(102)]),
    dataLinks = [],
    controlLinks = [],
  } = overrides;

  return {
    projectQueryService: {
      getFileIdByProjectId: jest
        .fn<QueryServices['projectQueryService']['getFileIdByProjectId']>()
        .mockResolvedValue(FILE_ID),
    },
    useCaseQueryService: {
      findUseCaseReadModels: jest
        .fn<QueryServices['useCaseQueryService']['findUseCaseReadModels']>()
        .mockResolvedValue({
          entityType: ENTITY_TYPE.UseCase,
          items: [new UseCaseReadModel(USECASE_ID, [])],
          failed: [],
        }),
    },
    spfModuleQueryService: {
      findBySubgraphId: jest
        .fn<QueryServices['spfModuleQueryService']['findBySubgraphId']>()
        .mockResolvedValue(modules),
      findByUsecaseIds: jest
        .fn<QueryServices['spfModuleQueryService']['findByUsecaseIds']>()
        .mockResolvedValue(modules),
    },
    dataLinkQueryService: {
      findBySubgraphIds: jest
        .fn<QueryServices['dataLinkQueryService']['findBySubgraphIds']>()
        .mockResolvedValue(dataLinks),
      findByUsecaseIds: jest
        .fn<QueryServices['dataLinkQueryService']['findByUsecaseIds']>()
        .mockResolvedValue(dataLinks),
    },
    controlLinkQueryService: {
      findBySubgraphIds: jest
        .fn<QueryServices['controlLinkQueryService']['findBySubgraphIds']>()
        .mockResolvedValue(controlLinks),
      findByUsecaseIds: jest
        .fn<QueryServices['controlLinkQueryService']['findByUsecaseIds']>()
        .mockResolvedValue(controlLinks),
    },
  } as unknown as QueryServices;
}

async function getComponents(
  services: QueryServices,
  scope: ComponentFlatScope = {
    type: COMPONENT_SCOPE_TYPE.Subgraph,
    systemId: SUBGRAPH_ID,
  },
): Promise<ComponentCollectionDto> {
  const result = await new GetComponentsHandler(services).handle(
    new GetComponentsQuery(scope, PROJECT_ID, 'client-1'),
  );
  expect(result.kind).toBe(RESULT_KIND.Ok);
  if (result.kind === RESULT_KIND.Fail) throw new Error('Components failed');
  return result.data;
}

describe('GetComponentsHandler', () => {
  it('returns only data links between the selected subgraph modules', async () => {
    const services = makeServices({
      dataLinks: [
        makeDataLink(201, 101, 102),
        makeDataLink(202, 102, 101),
        makeDataLink(203, 101, 101),
        makeDataLink(204, 101, 103),
        makeDataLink(205, 103, 102),
        makeDataLink(206, 103, 104),
      ],
    });

    const components = await getComponents(services);

    expect(components.spfModules.map(module => module.systemId)).toEqual([
      '101',
      '102',
    ]);
    expect(components.dataLinks.map(link => link.systemId)).toEqual([
      '201',
      '202',
      '203',
    ]);
  });

  it('returns only control links between the selected subgraph modules', async () => {
    const services = makeServices({
      controlLinks: [
        makeControlLink(701, 101, 102),
        makeControlLink(702, 102, 101),
        makeControlLink(703, 101, 101),
        makeControlLink(704, 101, 103),
        makeControlLink(705, 103, 102),
        makeControlLink(706, 103, 104),
      ],
    });

    const components = await getComponents(services);

    expect(components.controlLinks.map(link => link.systemId)).toEqual([
      '701',
      '702',
      '703',
    ]);
  });

  it('returns no links when the subgraph has no effective modules', async () => {
    const services = makeServices({
      modules: Result.ok([]),
      dataLinks: [makeDataLink(201, 101, 102)],
      controlLinks: [makeControlLink(701, 101, 102)],
    });

    const components = await getComponents(services);

    expect(components).toEqual({
      spfModules: [],
      dataLinks: [],
      controlLinks: [],
    });
  });

  it('includes internal links for modules nested under subsystems', async () => {
    const services = makeServices({
      modules: Result.ok([
        makeModule(101, SUBGRAPH_ID, 800),
        makeModule(102, SUBGRAPH_ID, 801),
      ]),
      dataLinks: [makeDataLink(201, 101, 102)],
      controlLinks: [makeControlLink(701, 101, 102)],
    });

    const components = await getComponents(services);

    expect(components.spfModules.map(module => module.parentSystemId)).toEqual([
      '800',
      '801',
    ]);
    expect(components.dataLinks.map(link => link.systemId)).toEqual(['201']);
    expect(components.controlLinks.map(link => link.systemId)).toEqual(['701']);
  });

  it('filters links using effective module membership on each request', async () => {
    const services = makeServices({
      dataLinks: [makeDataLink(201, 101, 102)],
      controlLinks: [makeControlLink(701, 101, 102)],
    });
    const moduleQuery = jest.mocked(
      services.spfModuleQueryService.findBySubgraphId,
    );

    const initial = await getComponents(services);
    expect(initial.dataLinks.map(link => link.systemId)).toEqual(['201']);
    expect(initial.controlLinks.map(link => link.systemId)).toEqual(['701']);

    moduleQuery.mockResolvedValueOnce(Result.ok([makeModule(101)]));
    const afterMoveOut = await getComponents(services);
    expect(afterMoveOut.dataLinks).toEqual([]);
    expect(afterMoveOut.controlLinks).toEqual([]);

    const afterMoveBack = await getComponents(services);
    expect(afterMoveBack.dataLinks.map(link => link.systemId)).toEqual(['201']);
    expect(afterMoveBack.controlLinks.map(link => link.systemId)).toEqual([
      '701',
    ]);
  });

  it('returns links between different subgraphs in usecase scope', async () => {
    const services = makeServices({
      modules: Result.ok([makeModule(101), makeModule(102, 4)]),
      dataLinks: [makeDataLink(201, 101, 102)],
      controlLinks: [makeControlLink(701, 101, 102)],
    });

    const components = await getComponents(services, {
      type: COMPONENT_SCOPE_TYPE.Usecase,
      systemIds: [USECASE_ID],
    });

    expect(
      components.spfModules.map(module => module.subgraphSystemId),
    ).toEqual(['3', '4']);
    expect(components.dataLinks.map(link => link.systemId)).toEqual(['201']);
    expect(components.controlLinks.map(link => link.systemId)).toEqual(['701']);
  });

  it('propagates a failed module query', async () => {
    const services = makeServices({
      modules: Result.fail(IssueFactory.dbError('Database unavailable')),
    });

    await expect(getComponents(services)).rejects.toThrow(
      'Database unavailable',
    );
  });

  it.each(['dataLinkQueryService', 'controlLinkQueryService'] as const)(
    'propagates a rejected %s query',
    async service => {
      const services = makeServices();
      jest
        .mocked(services[service].findBySubgraphIds)
        .mockRejectedValueOnce(new Error('Database unavailable'));

      await expect(getComponents(services)).rejects.toThrow(
        'Database unavailable',
      );
    },
  );
});
