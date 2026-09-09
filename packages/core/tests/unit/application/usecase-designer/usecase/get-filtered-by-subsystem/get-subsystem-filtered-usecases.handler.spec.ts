/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {GetSubsystemFilteredUsecasesHandler} from '../../../../../../src/application/usecase-designer/usecase/get-filtered-by-subsystem/get-subsystem-filtered-usecases.handler.js';
import {GetSubsystemFilteredUsecasesQuery} from '../../../../../../src/application/usecase-designer/usecase/get-filtered-by-subsystem/get-subsystem-filtered-usecases.query.js';
import {
  Result,
  RESULT_KIND,
} from '../../../../../../src/application/shared/result/result.js';
import type {QueryServices} from '../../../../../../src/application/ports/persistence/query-services/query-services.js';
import type {UsecaseFilteredGkvData} from '../../../../../../src/application/services/subsystem-filtered-gkv-service.js';
import {SubsystemFilteredGkvService} from '../../../../../../src/application/services/subsystem-filtered-gkv-service.js';

const emptyData: UsecaseFilteredGkvData = {
  usecases: [],
  subgraphSystemIdsByUsecase: new Map(),
  subsystems: [],
  modules: [],
};

describe('GetSubsystemFilteredUsecasesHandler', () => {
  function buildServices(dataResult = Result.ok(emptyData)) {
    return {
      projectQueryService: {
        getFileIdByProjectId: jest.fn().mockResolvedValue(42),
      },
      useCaseQueryService: {
        getUsecaseFilteredGkvData: jest.fn().mockResolvedValue(dataResult),
      },
    } as unknown as jest.Mocked<QueryServices>;
  }

  it('loads the project data and forwards the filter to core', async () => {
    const services = buildServices();
    const filter = {
      type: 'condition' as const,
      field: 'subsystemId',
      value: 0x10,
    };
    const coreService = {
      buildFilteredGkv: jest.fn().mockReturnValue(Result.ok([])),
    } as unknown as SubsystemFilteredGkvService;

    const result = await new GetSubsystemFilteredUsecasesHandler(
      services,
      coreService,
    ).handle(new GetSubsystemFilteredUsecasesQuery(7, 'client', filter));

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(
      services.projectQueryService.getFileIdByProjectId,
    ).toHaveBeenCalledWith(7);
    expect(
      services.useCaseQueryService.getUsecaseFilteredGkvData,
    ).toHaveBeenCalledWith(42);
    expect(coreService.buildFilteredGkv).toHaveBeenCalledWith(
      emptyData,
      filter,
    );
  });

  it('propagates persistence failures without transforming them', async () => {
    const services = buildServices(
      Result.fail({
        code: 'DB_QUERY_FAILED',
        message: 'failed',
        severity: 'Error',
      } as never),
    );
    const result = await new GetSubsystemFilteredUsecasesHandler(
      services,
      new SubsystemFilteredGkvService(),
    ).handle(new GetSubsystemFilteredUsecasesQuery(7, 'client'));

    expect(result).toEqual(expect.objectContaining({kind: RESULT_KIND.Fail}));
  });
});
