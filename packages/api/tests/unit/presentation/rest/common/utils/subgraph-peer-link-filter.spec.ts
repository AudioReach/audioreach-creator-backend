/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BadRequestException} from '@nestjs/common';
import {describe, expect, it} from '@jest/globals';
import {parseSubgraphPeerLinkFilter} from '../../../../../../src/presentation/rest/common/utils/subgraph-peer-link-filter.js';

describe('parseSubgraphPeerLinkFilter', () => {
  it('accepts a subgraph filter', () => {
    expect(parseSubgraphPeerLinkFilter({subgraphSystemId: '10'})).toEqual({
      subgraphSystemId: 10,
      moduleSystemId: undefined,
      portSystemId: undefined,
    });
  });

  it('accepts a module-port filter', () => {
    expect(
      parseSubgraphPeerLinkFilter({moduleSystemId: '20', portSystemId: '30'}),
    ).toEqual({
      subgraphSystemId: undefined,
      moduleSystemId: 20,
      portSystemId: 30,
    });
  });

  it('accepts combined filters', () => {
    expect(
      parseSubgraphPeerLinkFilter({
        subgraphSystemId: '10',
        moduleSystemId: '20',
        portSystemId: '30',
      }),
    ).toEqual({subgraphSystemId: 10, moduleSystemId: 20, portSystemId: 30});
  });

  it.each([
    {},
    {moduleSystemId: '20'},
    {portSystemId: '30'},
    {subgraphSystemId: ''},
    {moduleSystemId: 'abc', portSystemId: '30'},
  ])('rejects invalid filter values: %j', values => {
    expect(() => parseSubgraphPeerLinkFilter(values)).toThrow(
      BadRequestException,
    );
  });
});
