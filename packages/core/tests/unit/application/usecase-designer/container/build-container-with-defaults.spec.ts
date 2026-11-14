/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {describe, it, expect, jest} from '@jest/globals';
import {buildContainerWithDefaults} from '../../../../../src/application/usecase-designer/container/build-container-with-defaults.js';
import {PropertyDefinition} from '@arc/core';
import {CONTAINER_PROP_ID_STACK_SIZE} from '../../../../../src/domain/entities/definitions/spf-ids.js';

const VALID_ELEMENTS_STRUCTURE = JSON.stringify([
  {
    elementType: 'ConfigElement',
    name: 'v',
    dataType: 'UInt32',
    defaultValue: '0',
  },
]);

function makeStackSizeDef(systemId = 1): PropertyDefinition {
  return new PropertyDefinition({
    systemId,
    fileSystemId: 10,
    naturalId: CONTAINER_PROP_ID_STACK_SIZE,
    name: 'Stack Size',
    type: 'SPF',
    elementsStructure: VALID_ELEMENTS_STRUCTURE,
    maxSize: 4,
  });
}

function makeOtherDef(
  systemId = 2,
  naturalId = 0x08001011,
): PropertyDefinition {
  return new PropertyDefinition({
    systemId,
    fileSystemId: 10,
    naturalId,
    name: 'Other Prop',
    type: 'SPF',
    elementsStructure: VALID_ELEMENTS_STRUCTURE,
    maxSize: 4,
  });
}

describe('buildContainerWithDefaults', () => {
  it('gives stack-size a 4-byte non-null payload', () => {
    const container = buildContainerWithDefaults(
      {
        systemId: 100,
        containerNaturalId: 1,
        containerTypeSystemId: 50,
        fileSystemId: 10,
      },
      [makeStackSizeDef()],
    );
    const prop = container.properties.get(1);
    expect(prop).toBeDefined();
    const payload = prop!.getPayloadCopy();
    expect(payload).not.toBeNull();
    expect(payload!.byteLength).toBe(4);
  });

  it('gives non-stack-size properties a non-null serialized payload', () => {
    const container = buildContainerWithDefaults(
      {
        systemId: 100,
        containerNaturalId: 1,
        containerTypeSystemId: 50,
        fileSystemId: 10,
      },
      [makeStackSizeDef(1), makeOtherDef(2)],
    );
    const prop = container.properties.get(2);
    expect(prop).toBeDefined();
    expect(prop!.getPayloadCopy()).not.toBeNull();
  });

  it('throws when a non-stack-size property has malformed elementsStructure', () => {
    const badDef = new PropertyDefinition({
      systemId: 3,
      fileSystemId: 10,
      naturalId: 0x08001012,
      name: 'Bad Prop',
      type: 'SPF',
      elementsStructure: 'not-json',
      maxSize: 4,
    });
    expect(() =>
      buildContainerWithDefaults(
        {
          systemId: 100,
          containerNaturalId: 1,
          containerTypeSystemId: 50,
          fileSystemId: 10,
        },
        [makeStackSizeDef(1), badDef],
      ),
    ).toThrow(/Failed to serialize default data/);
  });

  it('throws when stack-size definition is absent', () => {
    expect(() =>
      buildContainerWithDefaults(
        {
          systemId: 100,
          containerNaturalId: 1,
          containerTypeSystemId: 50,
          fileSystemId: 10,
        },
        [makeOtherDef(2)],
      ),
    ).toThrow();
  });

  it('succeeds and clamps a non-stack-size defaultValue below min, logging a warning', () => {
    const defWithBadDefault = new PropertyDefinition({
      systemId: 5,
      fileSystemId: 10,
      naturalId: 0x08001014,
      name: 'Perf Mode',
      type: 'SPF',
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
      maxSize: 4,
    });
    const logWarnSpy = jest.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logger = {logWarn: logWarnSpy} as any;

    const container = buildContainerWithDefaults(
      {
        systemId: 100,
        containerNaturalId: 1,
        containerTypeSystemId: 50,
        fileSystemId: 10,
      },
      [makeStackSizeDef(1), defWithBadDefault],
      logger,
    );

    expect(container.properties.get(5)).toBeDefined();
    expect(container.properties.get(5)!.getPayloadCopy()).not.toBeNull();
    expect(logWarnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining('clamped to 1'),
      }),
    );
  });
});
