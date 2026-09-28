/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import {GetAllSubsystemsHandler} from '../../../../../../src/application/usecase-designer/subsystem/get-all/get-all-subsystems.handler.js';
import {GetAllSubsystemsQuery} from '../../../../../../src/application/usecase-designer/subsystem/get-all/get-all-subsystems.query.js';
import type {QueryServices} from '../../../../../../src/application/ports/persistence/query-services/query-services.js';
import {
  Result,
  RESULT_KIND,
} from '../../../../../../src/application/shared/result/result.js';

const FILE_SYSTEM_ID = 42;

const readModels = [
  {
    systemId: 10,
    subsystemNaturalId: 100,
    name: 'Subsystem_100',
    parentSystemId: 20,
    filteredKeys: [{systemId: 30, naturalId: 300, name: 'Key_300'}],
  },
];

function makeServices(
  result: Awaited<
    ReturnType<QueryServices['subsystemQueryService']['findAll']>
  > = Result.ok(readModels),
): QueryServices {
  return {
    projectQueryService: {
      getFileIdByProjectId: jest.fn().mockResolvedValue(FILE_SYSTEM_ID),
    },
    subsystemQueryService: {
      findAll: jest.fn().mockResolvedValue(result),
    },
  } as unknown as QueryServices;
}

describe('GetAllSubsystemsHandler', () => {
  it('resolves the project and maps subsystem read models', async () => {
    const services = makeServices();
    const result = await new GetAllSubsystemsHandler(services).handle(
      new GetAllSubsystemsQuery(7, 'client-1'),
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;

    expect(
      services.projectQueryService.getFileIdByProjectId,
    ).toHaveBeenCalledWith(7);
    expect(services.subsystemQueryService.findAll).toHaveBeenCalledWith(
      FILE_SYSTEM_ID,
      undefined,
    );
    expect(result.data).toEqual([
      {
        systemId: '10',
        naturalId: 100,
        name: 'Subsystem_100',
        parentSystemId: '20',
        dataPorts: [],
        controlPorts: [],
        filteredKeys: [{systemId: '30', naturalId: 300, name: 'Key_300'}],
      },
    ]);
  });

  it('forwards requested subsystem system IDs', async () => {
    const services = makeServices(Result.ok(readModels));

    await new GetAllSubsystemsHandler(services).handle(
      new GetAllSubsystemsQuery(7, 'client-1', [10, 999]),
    );

    expect(services.subsystemQueryService.findAll).toHaveBeenCalledWith(
      FILE_SYSTEM_ID,
      [10, 999],
    );
  });

  it('propagates persistence failures', async () => {
    const services = makeServices(
      Result.fail({
        code: 'DB_QUERY_FAILED',
        message: 'failed',
        severity: 'Error' as any,
      }),
    );

    const result = await new GetAllSubsystemsHandler(services).handle(
      new GetAllSubsystemsQuery(7, 'client-1'),
    );

    expect(result.kind).toBe(RESULT_KIND.Fail);
  });
});
