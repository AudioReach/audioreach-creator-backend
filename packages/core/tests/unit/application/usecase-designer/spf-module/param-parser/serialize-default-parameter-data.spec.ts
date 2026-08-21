/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {serializeDefaultParameterData} from '../../../../../../src/application/usecase-designer/shared/serialize-elements.js';
import type {ParameterDefinitionBase} from '../../../../../../src/application/ports/persistence/repositories/module/module-definition.repository.js';

function makeDefinition(elements: unknown[]): ParameterDefinitionBase {
  return {
    systemId: 1,
    isReadOnly: false,
    elementsStructure: JSON.stringify(elements),
  };
}

describe('serializeDefaultParameterData', () => {
  it('serializes scalar defaults from the definition', () => {
    const result = serializeDefaultParameterData(
      makeDefinition([
        {
          elementType: 'ConfigElement',
          name: 'count',
          dataType: 'UInt32',
          defaultValue: '7',
        },
      ]),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new DataView(result.value.buffer).getUint32(0, true)).toBe(7);
  });

  it('returns an error when a config element has no declared default', () => {
    const result = serializeDefaultParameterData(
      makeDefinition([
        {
          elementType: 'ConfigElement',
          name: 'count',
          dataType: 'UInt32',
        },
      ]),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('Missing defaultValue for element "count"');
  });

  it('uses default values to resolve formula-based array lengths', () => {
    const result = serializeDefaultParameterData(
      makeDefinition([
        {
          elementType: 'ConfigElement',
          name: 'count',
          dataType: 'UInt32',
          defaultValue: '2',
        },
        {
          elementType: 'ElementArray',
          name: 'items',
          arrayLength: 0,
          arrayLenFormulaStr: 'count',
          template: {
            elementType: 'ConfigElement',
            dataType: 'UInt16',
            defaultValue: '9',
          },
        },
      ]),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const view = new DataView(result.value.buffer);
    expect(view.getUint32(0, true)).toBe(2);
    expect(view.getUint16(4, true)).toBe(9);
    expect(view.getUint16(6, true)).toBe(9);
  });

  it('returns an error when a default array formula cannot be evaluated', () => {
    const result = serializeDefaultParameterData(
      makeDefinition([
        {
          elementType: 'ElementArray',
          name: 'items',
          arrayLength: 0,
          arrayLenFormulaStr: 'missing_count',
          template: {
            elementType: 'ConfigElement',
            dataType: 'UInt16',
            defaultValue: '9',
          },
        },
      ]),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Unknown variable');
  });
});
