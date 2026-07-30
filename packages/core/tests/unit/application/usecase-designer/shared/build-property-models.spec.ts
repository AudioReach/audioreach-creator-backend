/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {buildPropertyModels} from '../../../../../src/application/usecase-designer/shared/build-property-models.js';
import type {PropertyPayloadReadModel} from '../../../../../src/application/ports/persistence/query-services/shared/property-payload-read-model.js';
import type {PropertyDefinitionWithElements} from '../../../../../src/application/usecase-designer/shared/property-definition-with-elements.js';
import {PROPERTY_TYPE} from '../../../../../src/domain/entities/definitions/common/entities/property-definition.js';
import {RESULT_KIND} from '../../../../../src/application/shared/result/result.js';
import {ISSUE_CODE} from '../../../../../src/shared/issues/operational-codes.js';

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
  it('returns an empty ok result when payloads is empty', () => {
    const result = buildPropertyModels([], new Map());
    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(result.data).toEqual([]);
  });

  it('returns an empty ok result when defMap is empty', () => {
    const payload: PropertyPayloadReadModel = {
      systemId: 42,
      propertySystemId: 1,
      payload: null,
    };
    const result = buildPropertyModels([payload], new Map());
    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(result.data).toEqual([]);
  });

  it('maps systemId and propertyId from payload and definition', () => {
    const payload: PropertyPayloadReadModel = {
      systemId: 42,
      propertySystemId: 1,
      payload: null,
    };
    const def = makeDef({systemId: 1, propertyId: 100, name: 'volume'});
    const defMap = new Map([[1, def]]);

    const result = buildPropertyModels([payload], defMap);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    const [model] = result.data!;
    expect(model.systemId).toBe(42);
    expect(model.propertyId).toBe(100);
    expect(model.propertyName).toBe('volume');
  });

  it('sets elements to [] when payload is null', () => {
    const payload: PropertyPayloadReadModel = {
      systemId: 1,
      propertySystemId: 1,
      payload: null,
    };
    const defMap = new Map([[1, makeDef()]]);

    const result = buildPropertyModels([payload], defMap);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(result.data![0].elements).toEqual([]);
  });

  it('returns partial result with PROPERTY_PAYLOAD_NOT_FOUND issue when definition has no matching payload', () => {
    const def = makeDef({systemId: 2, propertyId: 200});
    const result = buildPropertyModels([], new Map([[2, def]]));

    expect(result.kind).toBe(RESULT_KIND.Partial);
    expect(result.data).toEqual([]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].code).toBe(ISSUE_CODE.PROPERTY_PAYLOAD_NOT_FOUND);
  });

  it('sets elements to [] when payload is null even when definition exists', () => {
    const payload: PropertyPayloadReadModel = {
      systemId: 5,
      propertySystemId: 1,
      payload: null,
    };
    const result = buildPropertyModels([payload], new Map([[1, makeDef()]]));

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(result.data![0].elements).toEqual([]);
  });
});
