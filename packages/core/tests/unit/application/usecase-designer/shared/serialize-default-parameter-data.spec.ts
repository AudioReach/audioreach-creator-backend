/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {describe, it, expect} from '@jest/globals';
import {serializeDefaultParameterData} from '../../../../../src/application/usecase-designer/shared/serialize-elements.js';
import {parseParameterData} from '../../../../../src/application/usecase-designer/shared/parse-elements.js';

const INT16_SCHEMA = JSON.stringify([
  {elementType: 'ConfigElement', dataType: 'Int16', defaultValue: '42'},
]);
const INT16_ZERO_SCHEMA = JSON.stringify([
  {elementType: 'ConfigElement', dataType: 'Int16'},
]);

describe('serializeDefaultParameterData', () => {
  it('returns Uint8Array with defaultValue for a single Int16 ConfigElement', () => {
    const def = {
      systemId: 1,
      isReadOnly: false,
      toolPolicy: 'CALIBRATION',
      elementsStructure: INT16_SCHEMA,
    };
    const result = serializeDefaultParameterData(def);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const dv = new DataView(result.value.buffer, result.value.byteOffset);
      expect(dv.getInt16(0, true)).toBe(42);
    }
  });

  it('uses 0 as default when defaultValue is absent', () => {
    const def = {
      systemId: 1,
      isReadOnly: false,
      toolPolicy: 'CALIBRATION',
      elementsStructure: INT16_ZERO_SCHEMA,
    };
    const result = serializeDefaultParameterData(def);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const dv = new DataView(result.value.buffer, result.value.byteOffset);
      expect(dv.getInt16(0, true)).toBe(0);
    }
  });

  it('returns ok:false for invalid elementsStructure JSON', () => {
    const def = {
      systemId: 1,
      isReadOnly: false,
      toolPolicy: 'CALIBRATION',
      elementsStructure: 'not-json',
    };
    const result = serializeDefaultParameterData(def);
    expect(result.ok).toBe(false);
  });

  it('builds defaults for structs and fixed and formula-based arrays', () => {
    const def = {
      systemId: 1,
      elementsStructure: JSON.stringify([
        {
          elementType: 'ConfigElement',
          name: 'count',
          dataType: 'UInt8',
          defaultValue: '2',
        },
        {
          elementType: 'ElementArray',
          arrayLenFormulaStr: 'count',
          template: {
            elementType: 'ConfigElement',
            dataType: 'UInt8',
            defaultValue: '7',
          },
        },
        {
          elementType: 'Struct',
          structureType: 'fixed_t',
          elements: [
            {
              elementType: 'ConfigElement',
              dataType: 'Int16',
              defaultValue: '300',
            },
          ],
        },
        {
          elementType: 'StructArray',
          arrayLength: 2,
          template: {
            elementType: 'Struct',
            structureType: 'item_t',
            elements: [
              {
                elementType: 'ConfigElement',
                dataType: 'UInt8',
                defaultValue: '9',
              },
            ],
          },
        },
      ]),
    };

    const result = serializeDefaultParameterData(def);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(16);
      const parsed = parseParameterData(result.value, def.elementsStructure);
      expect(parsed[0]).toMatchObject({value: '2'});
      expect(parsed[1]).toMatchObject({
        value: [{value: '7'}, {value: '7'}],
      });
      expect(parsed[2]).toMatchObject({value: [{value: '300'}]});
      expect(parsed[3]).toMatchObject({
        value: [{value: [{value: '9'}]}, {value: [{value: '9'}]}],
      });
    }
  });

  it('round-trips explicitly aligned default elements', () => {
    const def = {
      systemId: 1,
      elementsStructure: JSON.stringify([
        {
          elementType: 'ConfigElement',
          name: 'first',
          dataType: 'UInt8',
          defaultValue: '1',
        },
        {
          elementType: 'ConfigElement',
          name: 'aligned',
          dataType: 'UInt32',
          defaultValue: '42',
          alignment: 4,
        },
      ]),
    };

    const result = serializeDefaultParameterData(def);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(8);
      expect(parseParameterData(result.value, def.elementsStructure)).toEqual([
        expect.objectContaining({name: 'first', value: '1'}),
        expect.objectContaining({name: 'aligned', value: '42'}),
      ]);
    }
  });

  it('falls back to arrayLength when a formula resolves to zero', () => {
    const def = {
      systemId: 1,
      elementsStructure: JSON.stringify([
        {
          elementType: 'ConfigElement',
          name: 'count',
          dataType: 'UInt8',
          defaultValue: '0',
        },
        {
          elementType: 'ElementArray',
          name: 'values',
          arrayLenFormulaStr: 'count',
          arrayLength: 2,
          template: {
            elementType: 'ConfigElement',
            dataType: 'UInt8',
            defaultValue: '7',
          },
        },
      ]),
    };

    const result = serializeDefaultParameterData(def);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(
        parseParameterData(result.value, def.elementsStructure)[1],
      ).toMatchObject({value: [{value: '7'}, {value: '7'}]});
    }
  });
});
