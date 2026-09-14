/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {Result} from '../../../../../src/application/shared/result/result.js';
import type {QueryServices} from '../../../../../src/application/ports/persistence/query-services/query-services.js';
import {GetUsecaseChangeDetailsHandler} from '../../../../../src/application/usecase-designer/usecase/get-change-details/get-usecase-change-details.handler.js';
import {GetUsecaseChangeDetailsQuery} from '../../../../../src/application/usecase-designer/usecase/get-change-details/get-usecase-change-details.query.js';

describe('GetUsecaseChangeDetailsHandler', () => {
  it('resolves the file and delegates the group read to UseCaseQueryService', async () => {
    const queryServices = {
      projectQueryService: {
        getFileIdByProjectId: jest.fn().mockResolvedValue(42),
      },
      useCaseQueryService: {
        getChangeDetails: jest.fn().mockResolvedValue(Result.ok([])),
      },
    } as unknown as jest.Mocked<QueryServices>;

    await new GetUsecaseChangeDetailsHandler(queryServices).handle(
      new GetUsecaseChangeDetailsQuery(7, 'routing-group', 'client'),
    );

    expect(
      queryServices.projectQueryService.getFileIdByProjectId,
    ).toHaveBeenCalledWith(7);
    expect(
      queryServices.useCaseQueryService.getChangeDetails,
    ).toHaveBeenCalledWith(42, 'routing-group');
  });
});
