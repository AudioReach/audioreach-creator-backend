/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {PARAMETER_ELEMENT_TYPE} from './element-definition.js';
import {DATA_TYPE} from '../../../shared/dto/element-data/element-types.js';
import {convertParamDefinition, parseMinMax} from './parse-elements.js';
import type {
  ConfigElement,
  StructElement,
  ElementArray,
  StructArray,
  DefinitionElement,
} from './element-definition.js';
import type {Logger} from '../../../shared/types/logger.interface.js';
import type {ParameterDefinitionBase} from '../../ports/persistence/repositories/module/module-definition.repository.js';
import type {
  ElementData as ElementCalData,
  ConfigElementData,
  StructData,
  ElementArrayData,
} from '../../../domain/entities/definitions/common/types/element-data.js';
import {BinaryDataWriter} from './utils/binary-data-writer.js';
import {evaluateFormula} from './utils/formular-evaluator.js';

/** DTO alias for element arrays (GET response uses this; PUT input round-trips it back). */
const ELEMENT_ARRAY_DTO_TYPE = 'ElementTemplateArray' as const;

type SerializeResult =
  | {ok: true; value: Uint8Array}
  | {ok: false; error: string};

export function serializeParameterData(
  definition: ParameterDefinitionBase,
  inputElements: ElementCalData[],
  logger?: Logger,
): SerializeResult {
  let schema: DefinitionElement[];
  try {
    schema = convertParamDefinition(definition.elementsStructure);
  } catch {
    return {ok: false, error: 'Failed to parse elementsStructure JSON'};
  }

  const writer = new BinaryDataWriter();
  const parsedSoFar = new Map<string, number>();

  const result = serializeElements(
    schema,
    inputElements,
    writer,
    parsedSoFar,
    logger,
  );
  if (!result.ok) return result;

  writer.align(8);
  return {ok: true, value: writer.toUint8Array()};
}

function serializeElements(
  schema: DefinitionElement[],
  inputs: ElementCalData[],
  writer: BinaryDataWriter,
  parsedSoFar: Map<string, number>,
  logger?: Logger,
): SerializeResult {
  if (schema.length !== inputs.length) {
    return {
      ok: false,
      error: `Element count mismatch: expected ${schema.length}, got ${inputs.length}`,
    };
  }
  for (const [i, schemaDef] of schema.entries()) {
    const r = serializeElement(
      schemaDef,
      inputs[i],
      writer,
      parsedSoFar,
      logger,
    );
    if (!r.ok) return r;
  }
  return {ok: true, value: new Uint8Array(0)};
}

function serializeElement(
  def: DefinitionElement,
  input: ElementCalData,
  writer: BinaryDataWriter,
  parsedSoFar: Map<string, number>,
  logger?: Logger,
): SerializeResult {
  switch ((def as {elementType: string}).elementType) {
    case PARAMETER_ELEMENT_TYPE.ConfigElement:
      return serializeConfigElement(
        def as ConfigElement,
        input as ConfigElementData,
        writer,
        parsedSoFar,
      );
    case PARAMETER_ELEMENT_TYPE.Struct:
      return serializeStruct(
        def as StructElement,
        input as StructData,
        writer,
        parsedSoFar,
        logger,
      );
    case PARAMETER_ELEMENT_TYPE.ElementArray:
      return serializeArray(
        def as ElementArray,
        input as ElementArrayData,
        writer,
        parsedSoFar,
        logger,
      );
    case PARAMETER_ELEMENT_TYPE.StructArray:
      return serializeStructArray(
        def as StructArray,
        input as ElementArrayData,
        writer,
        parsedSoFar,
        logger,
      );
    default:
      return {
        ok: false,
        error: `Unknown elementType: ${def.elementType}`,
      };
  }
}

function serializeBigIntValue(
  dataType: string,
  def: ConfigElement,
  input: ConfigElementData,
  writer: BinaryDataWriter,
): SerializeResult {
  let v: bigint;
  try {
    v = BigInt(input.value);
  } catch {
    return {
      ok: false,
      error: `Cannot parse ${input.value} as bigint for ${dataType}`,
    };
  }
  if (def.min !== undefined && v < BigInt(def.min))
    return {ok: false, error: `Value ${v} below min ${def.min}`};
  if (def.max !== undefined && v > BigInt(def.max))
    return {ok: false, error: `Value ${v} above max ${def.max}`};
  if (dataType === DATA_TYPE.Int64) writer.writeInt64(v);
  else writer.writeUInt64(v);
  return {ok: true, value: new Uint8Array(0)};
}

function serializeRawData(
  input: ConfigElementData,
  writer: BinaryDataWriter,
): SerializeResult {
  const hex = input.value;
  if (hex.length % 2 !== 0) {
    return {
      ok: false,
      error: `Invalid RawData hex string (odd length): "${hex}"`,
    };
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    const b = Number.parseInt(hex.slice(i, i + 2), 16);
    if (Number.isNaN(b)) {
      return {
        ok: false,
        error: `Invalid hex byte "${hex.slice(i, i + 2)}" in RawData value`,
      };
    }
    bytes[i / 2] = b;
  }
  writer.writeRawData(bytes);
  return {ok: true, value: new Uint8Array(0)};
}

function serializeConfigElement(
  def: ConfigElement,
  input: ConfigElementData,
  writer: BinaryDataWriter,
  parsedSoFar: Map<string, number>,
): SerializeResult {
  if (input.type !== PARAMETER_ELEMENT_TYPE.ConfigElement) {
    return {
      ok: false,
      error: `Type mismatch: expected ConfigElement, got ${input.type as string}`,
    };
  }

  const dataType = def.dataType;

  if (dataType === DATA_TYPE.Int64 || dataType === DATA_TYPE.UInt64) {
    return serializeBigIntValue(dataType, def, input, writer);
  }

  if (dataType === DATA_TYPE.RawData) {
    return serializeRawData(input, writer);
  }

  const v = Number(input.value);
  if (!Number.isFinite(v))
    return {ok: false, error: `Cannot parse "${input.value}" as number`};

  const boundsError = checkDataTypeBounds(dataType, v);
  if (boundsError) return {ok: false, error: boundsError};

  const schemaMin = parseMinMax(def.min, dataType);
  const schemaMax = parseMinMax(def.max, dataType);
  if (schemaMin !== undefined && v < schemaMin)
    return {ok: false, error: `Value ${v} below min ${def.min}`};
  if (schemaMax !== undefined && v > schemaMax)
    return {ok: false, error: `Value ${v} above max ${def.max}`};

  const writeError = writeScalar(dataType, v, writer);
  if (writeError) return {ok: false, error: writeError};
  if (def.name) parsedSoFar.set(def.name, v);
  return {ok: true, value: new Uint8Array(0)};
}

function checkDataTypeBounds(dataType: string, v: number): string | null {
  switch (dataType) {
    case DATA_TYPE.Int8:
      if (v < -128 || v > 127) return `${v} out of Int8 range`;
      break;
    case DATA_TYPE.UInt8:
      if (v < 0 || v > 255) return `${v} out of UInt8 range`;
      break;
    case DATA_TYPE.Int16:
      if (v < -32_768 || v > 32_767) return `${v} out of Int16 range`;
      break;
    case DATA_TYPE.UInt16:
      if (v < 0 || v > 65_535) return `${v} out of UInt16 range`;
      break;
    case DATA_TYPE.Int32:
      if (v < -2_147_483_648 || v > 2_147_483_647)
        return `${v} out of Int32 range`;
      break;
    case DATA_TYPE.UInt32:
      if (v < 0 || v > 4_294_967_295) return `${v} out of UInt32 range`;
      break;
    case DATA_TYPE.Float:
      if (!Number.isFinite(Math.fround(v))) return `${v} out of Float32 range`;
      break;
  }
  return null;
}

function writeScalar(
  dataType: string,
  v: number,
  writer: BinaryDataWriter,
): string | null {
  switch (dataType) {
    case DATA_TYPE.Int8:
      writer.writeInt8(v);
      break;
    case DATA_TYPE.UInt8:
      writer.writeUInt8(v);
      break;
    case DATA_TYPE.Int16:
      writer.writeInt16(v);
      break;
    case DATA_TYPE.UInt16:
      writer.writeUInt16(v);
      break;
    case DATA_TYPE.Int32:
      writer.writeInt32(v);
      break;
    case DATA_TYPE.UInt32:
      writer.writeUInt32(v);
      break;
    case DATA_TYPE.Float:
      writer.writeFloat(v);
      break;
    case DATA_TYPE.Double:
      writer.writeDouble(v);
      break;
    default:
      return `Unsupported dataType: ${dataType}`;
  }
  return null;
}

function serializeStruct(
  def: StructElement,
  input: StructData,
  writer: BinaryDataWriter,
  parsedSoFar: Map<string, number>,
  logger?: Logger,
): SerializeResult {
  if (input.type !== PARAMETER_ELEMENT_TYPE.Struct) {
    return {
      ok: false,
      error: `Type mismatch: expected Struct, got ${input.type as string}`,
    };
  }
  const r = serializeElements(
    def.elements,
    input.value,
    writer,
    parsedSoFar,
    logger,
  );
  if (!r.ok) return r;
  writer.align(4);
  return {ok: true, value: new Uint8Array(0)};
}

function serializeArray(
  def: ElementArray,
  input: ElementArrayData,
  writer: BinaryDataWriter,
  parsedSoFar: Map<string, number>,
  logger?: Logger,
): SerializeResult {
  const inputType = (input as unknown as {type: string}).type;
  if (
    inputType !== PARAMETER_ELEMENT_TYPE.ElementArray &&
    inputType !== ELEMENT_ARRAY_DTO_TYPE
  ) {
    return {
      ok: false,
      error: `Type mismatch: expected ElementArray, got ${inputType}`,
    };
  }

  let expectedLength: number;
  if (def.arrayLenFormulaStr) {
    try {
      expectedLength = evaluateFormula(def.arrayLenFormulaStr, parsedSoFar);
    } catch (error) {
      return {
        ok: false,
        error: `Failed to evaluate array length formula: ${(error as Error).message}`,
      };
    }
  } else {
    expectedLength = def.arrayLength ?? input.value.length;
  }

  if (input.value.length !== expectedLength) {
    return {
      ok: false,
      error: `Array length mismatch: expected ${expectedLength}, got ${input.value.length}`,
    };
  }

  for (const item of input.value) {
    const r = serializeElement(def.template, item, writer, parsedSoFar, logger);
    if (!r.ok) return r;
  }
  return {ok: true, value: new Uint8Array(0)};
}

function serializeStructArray(
  def: StructArray,
  input: ElementArrayData,
  writer: BinaryDataWriter,
  parsedSoFar: Map<string, number>,
  logger?: Logger,
): SerializeResult {
  const inputType = (input as unknown as {type: string}).type;
  if (
    inputType !== PARAMETER_ELEMENT_TYPE.ElementArray &&
    inputType !== ELEMENT_ARRAY_DTO_TYPE
  ) {
    return {
      ok: false,
      error: `Type mismatch: expected ElementArray (StructArray), got ${inputType}`,
    };
  }

  let expectedLength: number;
  if (def.arrayLenFormulaStr) {
    try {
      expectedLength = evaluateFormula(def.arrayLenFormulaStr, parsedSoFar);
    } catch (error) {
      return {
        ok: false,
        error: `Failed to evaluate array length formula: ${(error as Error).message}`,
      };
    }
  } else {
    expectedLength = def.arrayLength ?? input.value.length;
  }

  if (input.value.length !== expectedLength) {
    return {
      ok: false,
      error: `StructArray length mismatch: expected ${expectedLength}, got ${input.value.length}`,
    };
  }

  for (const item of input.value) {
    const r = serializeElement(def.template, item, writer, parsedSoFar, logger);
    if (!r.ok) return r;
    writer.align(4);
  }
  return {ok: true, value: new Uint8Array(0)};
}
