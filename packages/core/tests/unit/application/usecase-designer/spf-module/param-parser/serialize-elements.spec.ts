/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {serializeParameterData} from '../../../../../../src/application/usecase-designer/shared/serialize-elements.js';
import type {ParameterDefinitionBase} from '../../../../../../src/application/ports/persistence/repositories/module/module-definition.repository.js';

function scalarDef(dataType: string, min?: string, max?: string): string {
  return JSON.stringify([{elementType: 'ConfigElement', dataType, min, max}]);
}

function structDef(children: object[]): string {
  return JSON.stringify([
    {elementType: 'Struct', structureType: 'S', elements: children},
  ]);
}

function arrayDef(itemType: string, length: number): string {
  return JSON.stringify([
    {
      elementType: 'ElementArray',
      arrayLength: length,
      template: {elementType: 'ConfigElement', dataType: itemType},
    },
  ]);
}

function makeDef(elementsStructure: string): ParameterDefinitionBase {
  return {systemId: 1, isReadOnly: false, elementsStructure};
}

describe('serializeParameterData', () => {
  it('serializes Int16 scalar correctly', () => {
    const def = makeDef(scalarDef('Int16'));
    const result = serializeParameterData(def, [
      {
        type: 'ConfigElement',
        name: 'x',
        isReadOnly: false,
        dataType: 'Int16',
        value: '300',
        min: undefined,
        max: undefined,
      },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const view = new DataView(result.value.buffer, result.value.byteOffset);
    expect(view.getInt16(0, true)).toBe(300);
    // 8-byte padded: 2 bytes value + 6 bytes padding
    expect(result.value.length).toBe(8);
  });

  it('returns ok:false when value is out of range', () => {
    const def = makeDef(scalarDef('Int8', '-128', '127'));
    const result = serializeParameterData(def, [
      {
        type: 'ConfigElement',
        name: 'x',
        isReadOnly: false,
        dataType: 'Int8',
        value: '200',
        min: -128,
        max: 127,
      },
    ]);
    expect(result.ok).toBe(false);
  });

  it('serializes UInt32 scalar', () => {
    const def = makeDef(scalarDef('UInt32'));
    const result = serializeParameterData(def, [
      {
        type: 'ConfigElement',
        name: 'x',
        isReadOnly: false,
        dataType: 'UInt32',
        value: '4294967295',
        min: undefined,
        max: undefined,
      },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const view = new DataView(result.value.buffer, result.value.byteOffset);
    expect(view.getUint32(0, true)).toBe(0xffffffff);
  });

  it('serializes Int64 using bigint', () => {
    const def = makeDef(scalarDef('Int64'));
    const result = serializeParameterData(def, [
      {
        type: 'ConfigElement',
        name: 'x',
        isReadOnly: false,
        dataType: 'Int64',
        value: '9007199254740993',
        min: undefined,
        max: undefined,
      },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const view = new DataView(result.value.buffer, result.value.byteOffset);
    expect(view.getBigInt64(0, true)).toBe(BigInt('9007199254740993'));
  });

  it('serializes scalar array', () => {
    const def = makeDef(arrayDef('Int16', 3));
    const result = serializeParameterData(def, [
      {
        type: 'ElementArray',
        name: 'arr',
        isReadOnly: false,
        value: [
          {
            type: 'ConfigElement',
            name: 'x',
            isReadOnly: false,
            dataType: 'Int16',
            value: '1',
            min: undefined,
            max: undefined,
          },
          {
            type: 'ConfigElement',
            name: 'x',
            isReadOnly: false,
            dataType: 'Int16',
            value: '2',
            min: undefined,
            max: undefined,
          },
          {
            type: 'ConfigElement',
            name: 'x',
            isReadOnly: false,
            dataType: 'Int16',
            value: '3',
            min: undefined,
            max: undefined,
          },
        ],
        template: [],
      },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const view = new DataView(result.value.buffer, result.value.byteOffset);
    expect(view.getInt16(0, true)).toBe(1);
    expect(view.getInt16(2, true)).toBe(2);
    expect(view.getInt16(4, true)).toBe(3);
  });

  it('returns ok:false when array length mismatches definition', () => {
    const def = makeDef(arrayDef('Int16', 3));
    const result = serializeParameterData(def, [
      {
        type: 'ElementArray',
        name: 'arr',
        isReadOnly: false,
        value: [
          {
            type: 'ConfigElement',
            name: 'x',
            isReadOnly: false,
            dataType: 'Int16',
            value: '1',
            min: undefined,
            max: undefined,
          },
        ],
        template: [],
      },
    ]);
    expect(result.ok).toBe(false);
  });

  it('serializes Struct with 4-byte alignment', () => {
    const def = makeDef(
      structDef([
        {elementType: 'ConfigElement', dataType: 'UInt8'},
        {elementType: 'ConfigElement', dataType: 'UInt8'},
      ]),
    );
    const result = serializeParameterData(def, [
      {
        type: 'Struct',
        name: 's',
        isReadOnly: false,
        structType: 'S',
        value: [
          {
            type: 'ConfigElement',
            name: 'x',
            isReadOnly: false,
            dataType: 'UInt8',
            value: '10',
            min: undefined,
            max: undefined,
          },
          {
            type: 'ConfigElement',
            name: 'y',
            isReadOnly: false,
            dataType: 'UInt8',
            value: '20',
            min: undefined,
            max: undefined,
          },
        ],
      },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 2 bytes struct + 2 bytes struct align (to 4) + 4 bytes payload align (to 8) = 8
    expect(result.value.length).toBe(8);
    expect(result.value[0]).toBe(10);
    expect(result.value[1]).toBe(20);
  });

  it('returns ok:false on type discriminator mismatch', () => {
    const def = makeDef(scalarDef('Int16'));
    const result = serializeParameterData(def, [
      {
        type: 'Struct',
        name: 's',
        isReadOnly: false,
        structType: 'S',
        value: [],
      } as any,
    ]);
    expect(result.ok).toBe(false);
  });

  it('serializes dynamic array whose length is driven by an arithmetic formula (count*2 - 1)', () => {
    // count=2, formula "count*2 - 1" resolves to 3 → data has 3 UInt16 items
    // This tests the formula evaluator handles multiplication and subtraction together.
    // Layout: [count=2 (2B), data[0]=10 (2B), data[1]=20 (2B), data[2]=30 (2B)] = 8 bytes
    const def = makeDef(
      JSON.stringify([
        {elementType: 'ConfigElement', name: 'count', dataType: 'UInt16'},
        {
          elementType: 'ElementArray',
          name: 'data',
          arrayLenFormulaStr: 'count*2 - 1',
          template: {elementType: 'ConfigElement', dataType: 'UInt16'},
        },
      ]),
    );
    const result = serializeParameterData(def, [
      {
        type: 'ConfigElement',
        name: 'count',
        isReadOnly: false,
        dataType: 'UInt16',
        value: '2',
        min: undefined,
        max: undefined,
      },
      {
        type: 'ElementArray',
        name: 'data',
        isReadOnly: false,
        template: [],
        value: [
          {
            type: 'ConfigElement',
            name: 'data[0]',
            isReadOnly: false,
            dataType: 'UInt16',
            value: '10',
            min: undefined,
            max: undefined,
          },
          {
            type: 'ConfigElement',
            name: 'data[1]',
            isReadOnly: false,
            dataType: 'UInt16',
            value: '20',
            min: undefined,
            max: undefined,
          },
          {
            type: 'ConfigElement',
            name: 'data[2]',
            isReadOnly: false,
            dataType: 'UInt16',
            value: '30',
            min: undefined,
            max: undefined,
          },
        ],
      },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBe(8);
    const view = new DataView(result.value.buffer, result.value.byteOffset);
    expect(view.getUint16(0, true)).toBe(2); // count
    expect(view.getUint16(2, true)).toBe(10); // data[0]
    expect(view.getUint16(4, true)).toBe(20); // data[1]
    expect(view.getUint16(6, true)).toBe(30); // data[2]
  });

  it('serializes Struct containing a dynamic StructArray driven by an outer-scope scalar (cross-level formula)', () => {
    // num_items=2 is a TOP-LEVEL scalar (not a sibling inside wrapper).
    // wrapper.items StructArray resolves its length from parsedSoFar (cross-level).
    //
    // Layout (little-endian):
    //   [0-1]   num_items=2 (UInt16)
    //   [2-5]   items[0].val=100 (UInt32)
    //   [6-7]   struct align(4) padding  (pos 6 → 8)
    //   [8-11]  items[1].val=200 (UInt32)
    //   [12-15] struct align(4) padding (pos 12 → 16) — outer struct align
    //   [16-23] parameter align(8) padding (pos 16 → 16 — already aligned)
    const def = makeDef(
      JSON.stringify([
        {elementType: 'ConfigElement', name: 'num_items', dataType: 'UInt16'},
        {
          elementType: 'Struct',
          name: 'wrapper',
          structureType: 'wrapper_t',
          elements: [
            {
              elementType: 'StructArray',
              name: 'items',
              arrayLenFormulaStr: 'num_items',
              template: {
                elementType: 'Struct',
                name: 'item',
                structureType: 'item_t',
                elements: [
                  {
                    elementType: 'ConfigElement',
                    name: 'val',
                    dataType: 'UInt32',
                  },
                ],
              },
            },
          ],
        },
      ]),
    );
    const result = serializeParameterData(def, [
      {
        type: 'ConfigElement',
        name: 'num_items',
        isReadOnly: false,
        dataType: 'UInt16',
        value: '2',
        min: undefined,
        max: undefined,
      },
      {
        type: 'Struct',
        name: 'wrapper',
        isReadOnly: false,
        structType: 'wrapper_t',
        value: [
          {
            type: 'ElementArray',
            name: 'items',
            isReadOnly: false,
            template: [],
            value: [
              {
                type: 'Struct',
                name: 'items[0]',
                isReadOnly: false,
                structType: 'item_t',
                value: [
                  {
                    type: 'ConfigElement',
                    name: 'val',
                    isReadOnly: false,
                    dataType: 'UInt32',
                    value: '100',
                    min: undefined,
                    max: undefined,
                  },
                ],
              },
              {
                type: 'Struct',
                name: 'items[1]',
                isReadOnly: false,
                structType: 'item_t',
                value: [
                  {
                    type: 'ConfigElement',
                    name: 'val',
                    isReadOnly: false,
                    dataType: 'UInt32',
                    value: '200',
                    min: undefined,
                    max: undefined,
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 2 (num_items) + [4 (items[0].val) + 2 pad align4] + [4 (items[1].val) + 4 pad align4] + outer struct align4 = 16 → already 8-aligned
    expect(result.value.length).toBe(16);
    const view = new DataView(result.value.buffer, result.value.byteOffset);
    expect(view.getUint16(0, true)).toBe(2); // num_items
    expect(view.getUint32(2, true)).toBe(100); // items[0].val (pos 2)
    // pos=6 after UInt32, struct align(4) → pos=8 (2 pad bytes)
    expect(view.getUint32(8, true)).toBe(200); // items[1].val (pos 8)
  });

  it('serializes nested StructArrays with cross-level formula reference (IIR_MBDRC pattern)', () => {
    // Mirrors IIR_MBDRC:
    //   num_bands=2, num_config=2 at top level
    //   config_data: StructArray (len=num_config=2)
    //   Each config_data[x]: Struct containing subband_drc StructArray (len=num_bands=2)
    //     — num_bands is a TOP-LEVEL variable, not a sibling inside config_data[x]
    //   Each subband_drc[y]: Struct { drc_mode: UInt16 }
    //
    // Layout (little-endian):
    //   [0-1]   num_bands=2
    //   [2-3]   num_config=2
    //   --- config_data[0] ---
    //   [4-5]   subband_drc[0].drc_mode=1; struct align(4) → [6-7] pad
    //   [8-9]   subband_drc[1].drc_mode=2; struct align(4) → [10-11] pad
    //   outer struct align(4): pos=12 already aligned
    //   --- config_data[1] ---
    //   [12-13] subband_drc[0].drc_mode=3; struct align(4) → [14-15] pad
    //   [16-17] subband_drc[1].drc_mode=4; struct align(4) → [18-19] pad
    //   outer struct align(4): pos=20 already aligned
    //   parameter align(8): pos=20 → [20-23] pad → 24 bytes total
    const def = makeDef(
      JSON.stringify([
        {elementType: 'ConfigElement', name: 'num_bands', dataType: 'UInt16'},
        {elementType: 'ConfigElement', name: 'num_config', dataType: 'UInt16'},
        {
          elementType: 'StructArray',
          name: 'config_data',
          arrayLenFormulaStr: 'num_config',
          template: {
            elementType: 'Struct',
            name: 'config_item',
            structureType: 'config_t',
            elements: [
              {
                elementType: 'StructArray',
                name: 'subband_drc',
                arrayLenFormulaStr: 'num_bands',
                template: {
                  elementType: 'Struct',
                  name: 'subband_item',
                  structureType: 'subband_t',
                  elements: [
                    {
                      elementType: 'ConfigElement',
                      name: 'drc_mode',
                      dataType: 'UInt16',
                    },
                  ],
                },
              },
            ],
          },
        },
      ]),
    );

    function makeSubband(drcMode: string) {
      return {
        type: 'Struct' as const,
        name: 'subband',
        isReadOnly: false,
        structType: 'subband_t',
        value: [
          {
            type: 'ConfigElement' as const,
            name: 'drc_mode',
            isReadOnly: false,
            dataType: 'UInt16' as const,
            value: drcMode,
            min: undefined,
            max: undefined,
          },
        ],
      };
    }
    function makeConfig(drcModes: string[]) {
      return {
        type: 'Struct' as const,
        name: 'config',
        isReadOnly: false,
        structType: 'config_t',
        value: [
          {
            type: 'ElementArray' as const,
            name: 'subband_drc',
            isReadOnly: false,
            template: [],
            value: drcModes.map(m => makeSubband(m)),
          },
        ],
      };
    }

    const result = serializeParameterData(def, [
      {
        type: 'ConfigElement',
        name: 'num_bands',
        isReadOnly: false,
        dataType: 'UInt16',
        value: '2',
        min: undefined,
        max: undefined,
      },
      {
        type: 'ConfigElement',
        name: 'num_config',
        isReadOnly: false,
        dataType: 'UInt16',
        value: '2',
        min: undefined,
        max: undefined,
      },
      {
        type: 'ElementArray',
        name: 'config_data',
        isReadOnly: false,
        template: [],
        value: [makeConfig(['1', '2']), makeConfig(['3', '4'])],
      },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBe(24);
    const view = new DataView(result.value.buffer, result.value.byteOffset);
    expect(view.getUint16(0, true)).toBe(2); // num_bands
    expect(view.getUint16(2, true)).toBe(2); // num_config
    expect(view.getUint16(4, true)).toBe(1); // config_data[0].subband_drc[0].drc_mode
    expect(view.getUint16(8, true)).toBe(2); // config_data[0].subband_drc[1].drc_mode
    expect(view.getUint16(12, true)).toBe(3); // config_data[1].subband_drc[0].drc_mode
    expect(view.getUint16(16, true)).toBe(4); // config_data[1].subband_drc[1].drc_mode
  });

  it('returns ok:false when Float value exceeds Float32 range', () => {
    const def = makeDef(scalarDef('Float'));
    const result = serializeParameterData(def, [
      {
        type: 'ConfigElement',
        name: 'x',
        isReadOnly: false,
        dataType: 'Float',
        value: '5e38',
        min: undefined,
        max: undefined,
      },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Float32 range');
  });
});
