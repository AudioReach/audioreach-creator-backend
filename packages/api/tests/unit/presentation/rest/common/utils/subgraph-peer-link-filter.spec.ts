/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BadRequestException} from '@nestjs/common';
import {
  parseModulePortLinkFilter,
  parseSubgraphLinkFilter,
} from '../../../../../../src/presentation/rest/common/utils/subgraph-peer-link-filter.js';

describe('link query filter parsing', () => {
  describe('parseModulePortLinkFilter', () => {
    it('requires moduleSystemId', () => {
      expect(() => parseModulePortLinkFilter({portSystemId: '20'})).toThrow(
        BadRequestException,
      );
    });

    it('requires portSystemId', () => {
      expect(() => parseModulePortLinkFilter({moduleSystemId: '10'})).toThrow(
        BadRequestException,
      );
    });

    it('rejects subgraphSystemId', () => {
      expect(() =>
        parseModulePortLinkFilter({
          moduleSystemId: '10',
          portSystemId: '20',
          subgraphSystemId: '30',
        }),
      ).toThrow(BadRequestException);
    });

    it('parses required module and port system IDs', () => {
      expect(
        parseModulePortLinkFilter({
          moduleSystemId: '10',
          portSystemId: '20',
        }),
      ).toEqual({moduleSystemId: 10, portSystemId: 20});
    });
  });

  describe('parseSubgraphLinkFilter', () => {
    it('requires subgraphSystemId', () => {
      expect(() => parseSubgraphLinkFilter({})).toThrow(BadRequestException);
    });

    it('parses subgraphSystemId without a peer', () => {
      expect(parseSubgraphLinkFilter({subgraphSystemId: '30'})).toEqual({
        subgraphSystemId: 30,
      });
    });

    it('parses optional subgraphPeerSystemId', () => {
      expect(
        parseSubgraphLinkFilter({
          subgraphSystemId: '30',
          subgraphPeerSystemId: '40',
        }),
      ).toEqual({subgraphSystemId: 30, subgraphPeerSystemId: 40});
    });
  });
});
