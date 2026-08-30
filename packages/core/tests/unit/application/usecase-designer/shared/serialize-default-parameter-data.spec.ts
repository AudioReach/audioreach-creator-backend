/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {describe, it, expect} from '@jest/globals';
import {serializeDefaultParameterData} from '../../../../../src/application/usecase-designer/shared/serialize-elements.js';

const UINT32_DEF = {
  systemId: 1,
  elementsStructure: JSON.stringify([
    {
      elementType: 'ConfigElement',
      name: 'val',
      dataType: 'UInt32',
      defaultValue: '42',
    },
  ]),
};

const UINT32_DEF_NO_DEFAULT = {
  systemId: 2,
  elementsStructure: JSON.stringify([
    {elementType: 'ConfigElement', name: 'val', dataType: 'UInt32'},
  ]),
};

const STRUCT_DEF = {
  systemId: 3,
  elementsStructure: JSON.stringify([
    {
      elementType: 'Struct',
      name: 's',
      structureType: 'MyStruct',
      elements: [
        {
          elementType: 'ConfigElement',
          name: 'a',
          dataType: 'UInt16',
          defaultValue: '7',
        },
      ],
    },
  ]),
};

const ARRAY_DEF = {
  systemId: 4,
  elementsStructure: JSON.stringify([
    {
      elementType: 'ElementArray',
      name: 'arr',
      arrayLength: 3,
      template: {
        elementType: 'ConfigElement',
        name: 'item',
        dataType: 'UInt8',
        defaultValue: '1',
      },
    },
  ]),
};

const BAD_DEF = {systemId: 5, elementsStructure: 'not-json'};

describe('serializeDefaultParameterData', () => {
  it('serializes a single UInt32 ConfigElement using its defaultValue', () => {
    const result = serializeDefaultParameterData(UINT32_DEF);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 42 as UInt32 LE = [0x2A, 0x00, 0x00, 0x00], aligned to 8 bytes
    expect(result.value[0]).toBe(0x2a);
    expect(result.value[1]).toBe(0x00);
  });

  it('uses 0 when defaultValue is absent', () => {
    const result = serializeDefaultParameterData(UINT32_DEF_NO_DEFAULT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]).toBe(0x00);
  });

  it('recurses into Struct children', () => {
    const result = serializeDefaultParameterData(STRUCT_DEF);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // UInt16 value 7 = [0x07, 0x00]
    expect(result.value[0]).toBe(0x07);
  });

  it('repeats the template for each array slot', () => {
    const result = serializeDefaultParameterData(ARRAY_DEF);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 3 UInt8 bytes each = 1
    expect(result.value[0]).toBe(1);
    expect(result.value[1]).toBe(1);
    expect(result.value[2]).toBe(1);
  });

  it('returns ok:false for malformed elementsStructure', () => {
    const result = serializeDefaultParameterData(BAD_DEF);
    expect(result.ok).toBe(false);
  });
});
