/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {describe, it, expect, jest} from '@jest/globals';
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
      {systemId: 1, subgraphNaturalId: 100, name: 'test', fileSystemId: 7},
      [VALID_DEF],
    );
    const prop = sg.properties[0];
    expect(prop).toBeDefined();
    expect(prop.getPayloadCopy()).not.toBeNull();
  });

  it('throws when elementsStructure is malformed', () => {
    expect(() =>
      buildSubgraphWithDefaults(
        {systemId: 2, subgraphNaturalId: 101, name: 'bad', fileSystemId: 7},
        [BAD_DEF],
      ),
    ).toThrow(/Failed to serialize default data/);
  });

  it('succeeds and clamps defaultValue below min, logging a warning', () => {
    const defWithBadDefault: SubgraphPropertyDefinitionRecord = {
      systemId: 5913968643,
      elementsStructure: JSON.stringify([
        {
          elementType: 'ConfigElement',
          name: 'Perf_Mode',
          dataType: 'UInt32',
          defaultValue: '0',
          min: '0x00000001',
          max: '0x00000002',
        },
      ]),
    };
    const logWarnSpy = jest.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logger = {logWarn: logWarnSpy} as any;

    const sg = buildSubgraphWithDefaults(
      {systemId: 3, subgraphNaturalId: 102, name: 'clamped', fileSystemId: 7},
      [defWithBadDefault],
      logger,
    );

    expect(sg.properties[0]).toBeDefined();
    expect(sg.properties[0].getPayloadCopy()).not.toBeNull();
    expect(logWarnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining('clamped to 1'),
      }),
    );
  });
});
