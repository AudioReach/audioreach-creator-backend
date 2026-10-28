/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CreateUsecasesCommand} from '../../../../../src/application/usecase-designer/use-case-creator/create-usecases/create-usecases.command.js';
import type {AutoRoutingCommandInput} from '../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-command-input.js';

describe('CreateUsecasesCommand', () => {
  it('stores the supplied input reference unchanged', () => {
    const input: AutoRoutingCommandInput = {
      activeSubgraphs: [],
      includedDataLinkSystemIds: ['40'],
      includedControlLinkSystemIds: ['50'],
    };

    const command = new CreateUsecasesCommand(1, input);

    expect(command.input).toBe(input);
  });
});
