/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../application/shared/result/result.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {Result as ResultType} from '../../../../application/shared/result/result.js';

export class SubsystemLinkResolutionService {
  // eslint-disable-next-line @typescript-eslint/require-await -- Placeholder service retains its async contract.
  async resolveAllChains(_uow: UnitOfWork): Promise<ResultType<void>> {
    return Result.fail(
      IssueFactory.dbError(
        'Subsystem-link chain resolution is unavailable in the temporary stub.',
      ),
    );
  }
}
