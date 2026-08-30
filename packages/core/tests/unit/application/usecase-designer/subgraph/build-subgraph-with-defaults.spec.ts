/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {describe, it, expect} from '@jest/globals';
import {buildSubgraphWithDefaults} from '../../../../../src/application/usecase-designer/subgraph/build-subgraph-with-defaults.js';
import type {SubgraphPropertyDefinitionRecord} from '../../../../../src/application/ports/persistence/repositories/property-definitions/property-definitions.repository.js';

const VALID_DEF: SubgraphPropertyDefinitionRecord = {
  systemId: 10,
  elementsStructure: JSON.stringify([
    {
      elementType: 'ConfigElement',
      name: 'v',
      dataType: 'UInt32',
      defaultValue: '5',
    },
  ]),
};

const BAD_DEF: SubgraphPropertyDefinitionRecord = {
  systemId: 11,
  elementsStructure: 'not-json',
};

describe('buildSubgraphWithDefaults', () => {
  it('sets a non-null Uint8Array payload for a valid elementsStructure', () => {
    const sg = buildSubgraphWithDefaults(
      {systemId: 1, subgraphId: 100, name: 'test', fileSystemId: 7},
      [VALID_DEF],
    );
    const prop = sg.properties[0];
    expect(prop).toBeDefined();
    expect(prop.getPayloadCopy()).not.toBeNull();
  });

  it('falls back to null payload when elementsStructure is malformed', () => {
    const sg = buildSubgraphWithDefaults(
      {systemId: 2, subgraphId: 101, name: 'bad', fileSystemId: 7},
      [BAD_DEF],
    );
    expect(sg.properties[0].getPayloadCopy()).toBeNull();
  });
});
