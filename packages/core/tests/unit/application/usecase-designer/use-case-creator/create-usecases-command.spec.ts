/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CreateManualUsecasesCommand} from '../../../../../src/application/usecase-designer/use-case-creator/create-manual-usecases/create-manual-usecases.command.js';
import {CreateUsecasesCommand} from '../../../../../src/application/usecase-designer/use-case-creator/create-usecases/create-usecases.command.js';

const input = {
  selectedUsecaseSystemIds: ['10', '0x0b'],
  activeSubgraphs: [{systemId: '20', valueSystemIds: [['30', '0x1f'], ['32']]}],
  excludedDataLinkSystemIds: ['40'],
  excludedControlLinkSystemIds: ['50'],
  excludedSubgraphSystemIds: ['60'],
} as const;

describe.each([
  ['automatic', CreateUsecasesCommand],
  ['manual', CreateManualUsecasesCommand],
])('%s create-usecases command', (_mode, CommandType) => {
  it('parses all request ID strings in Core', () => {
    const command = new CommandType(1, input);

    expect(command.selection.selectedUsecaseSystemIds).toEqual([10, 11]);
    expect(command.selection.activeSubgraphs).toEqual([
      {systemId: 20, sgkvs: [[30, 31], [32]]},
    ]);
    expect(command.selection.excludedDataLinkSystemIds).toEqual([40]);
    expect(command.selection.excludedControlLinkSystemIds).toEqual([50]);
    expect(command.selection.excludedSubgraphSystemIds).toEqual([60]);
  });

  it('rejects malformed nested IDs', () => {
    expect(
      () =>
        new CommandType(1, {
          selectedUsecaseSystemIds: [],
          activeSubgraphs: [{systemId: '20', valueSystemIds: [['not-an-id']]}],
        }),
    ).toThrow('activeSubgraphs.valueSystemIds must be an integer');
  });
});
