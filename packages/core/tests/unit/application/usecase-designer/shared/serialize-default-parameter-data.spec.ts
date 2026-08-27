/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {describe, it, expect} from '@jest/globals';
import {serializeDefaultParameterData} from '../../../../../src/application/usecase-designer/shared/serialize-elements.js';

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
});
