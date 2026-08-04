/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {buildPropertyModels} from '../../../../../src/application/usecase-designer/shared/build-property-models.js';
import type {PropertyPayloadReadModel} from '../../../../../src/application/ports/persistence/query-services/shared/property-payload-read-model.js';
import type {PropertyDefinitionWithElements} from '../../../../../src/application/usecase-designer/shared/property-definition-with-elements.js';
import {PARAMETER_ELEMENT_TYPE} from '../../../../../src/application/usecase-designer/spf-module/param-parser/types/element-definition.js';
import {PROPERTY_TYPE} from '../../../../../src/domain/entities/definitions/common/entities/property-definition.js';

// parseParameterData is the real binary parser — tests below use null payloads
// to exercise the mapping logic without needing a valid binary blob.

const makeDef = (
  overrides: Partial<PropertyDefinitionWithElements> = {},
): PropertyDefinitionWithElements => ({
  systemId: 1,
  propertyId: 100,
  name: 'volume',
  description: 'Volume property',
  propertyType: PROPERTY_TYPE.Spf,
  maxSize: 256,
  elementsStructure: '',
  ...overrides,
});

describe('buildPropertyModels', () => {
  it('returns an empty array when payloads is empty', () => {
    const result = buildPropertyModels([], new Map());
    expect(result).toEqual([]);
  });

  it('maps systemId and propertyId from payload and definition', () => {
    const payload: PropertyPayloadReadModel = {
      systemId: 42,
      propertySystemId: 1,
      payload: null,
    };
    const def = makeDef({systemId: 1, propertyId: 100, name: 'volume'});
    const defMap = new Map([[1, def]]);

    const [model] = buildPropertyModels([payload], defMap);

    expect(model.systemId).toBe(42);
    expect(model.propertyId).toBe(100);
    expect(model.propertyName).toBe('volume');
    expect(model.hasDefinition).toBe(true);
  });

  it('sets elements to [] when payload is null', () => {
    const payload: PropertyPayloadReadModel = {
      systemId: 1,
      propertySystemId: 1,
      payload: null,
    };
    const defMap = new Map([[1, makeDef()]]);

    const [model] = buildPropertyModels([payload], defMap);

    expect(model.elements).toEqual([]);
  });

  it('sets hasDefinition=false and uses fallback values when no matching definition', () => {
    const payload: PropertyPayloadReadModel = {
      systemId: 7,
      propertySystemId: 99,
      payload: null,
    };

    const [model] = buildPropertyModels([payload], new Map());

    expect(model.hasDefinition).toBe(false);
    expect(model.propertyId).toBe(0);
    expect(model.propertyName).toBe('');
    expect(model.elements).toEqual([]);
  });

  it('sets elements to [] when payload is null even when definition exists', () => {
    const payload: PropertyPayloadReadModel = {
      systemId: 5,
      propertySystemId: 1,
      payload: null,
    };
    const [model] = buildPropertyModels([payload], new Map([[1, makeDef()]]));
    expect(model.elements).toEqual([]);
  });
});
