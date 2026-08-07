/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {PARAMETER_ELEMENT_TYPE} from '../spf-module/param-parser/types/element-definition.js';
import type {
  ConfigElement,
  StructElement,
  ElementArray,
  StructArray,
  DefinitionElement,
} from '../spf-module/param-parser/types/element-definition.js';
import type {Logger} from '../../../shared/types/logger.interface.js';
import type {
  ElementData,
  ConfigElementData,
  StructData,
  ElementArrayData,
} from '../../../domain/entities/definitions/common/types/element-data.js';
import {BinaryDataReader} from './utils/binary-data-reader.js';
import {evaluateFormula} from './utils/formular-evaluator.js';

/**
 * Converts a `Uint8Array` to a lowercase hex string (e.g. `[0x0a, 0xff]` → `"0aff"`).
 * Used to produce the `Failed to parse payload` fallback value when parsing fails.
 */
function toHex(payload: Uint8Array): string {
  return [...payload].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Produces a single `Failed to parse payload` `ConfigElementData` entry containing the full payload
 * as a hex string. Returned whenever parsing fails for any reason (malformed JSON,
 * buffer overflow, or any other runtime error).
 */
function rawFallback(payload: Uint8Array): ConfigElementData {
  return {
    type: PARAMETER_ELEMENT_TYPE.ConfigElement,
    name: 'Failed to parse payload',
    isReadOnly: true,
    dataType: 'RawData',
    value: toHex(payload),
  };
}

/** Loosely-typed representation of an original element object from `paramStructure` JSON. */
type OriginalElement = Record<string, unknown>;

/** Parses a min/max string using the same dataType dispatch as readScalar.
 *  Returns undefined for absent, non-finite, or inapplicable (RawData) values. */
function parseMinMax(
  value: string | undefined,
  dataType: string,
): number | undefined {
  if (value === undefined) return undefined;
  let n: number;
  switch (dataType) {
    case 'UInt8':
    case 'UInt16':
    case 'UInt32':
    case 'UInt64':
    case 'Int8':
    case 'Int16':
    case 'Int32':
    case 'Int64':
      n = Number.parseInt(value, 10);
      break;
    case 'Float':
    case 'Double':
      n = Number.parseFloat(value);
      break;
    default:
      return undefined;
  }
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Converts a `paramStructure` JSON string into a normalized `DefinitionElement[]`.
 *
 * Handles special cases where `template` is not stored directly on the element:
 * - `StructArray` with `keyStructureDefinition` → `StructArray` with a `StructElement` template
 * - `ConfigElementArray` → `ElementArray` with a `ConfigElement` template (self-derived)
 */
function convertParamDefinition(paramStructure: string): DefinitionElement[] {
  const original = JSON.parse(paramStructure) as OriginalElement[];
  return original.map(el => normalizeElement(el));
}

/**
 * Normalizes an original element recursively, routing array and struct types
 * to their respective handlers so that nested arrays always carry a `template`.
 *
 * - `StructArray`        → `normalizeStructArray`
 * - `ConfigElementArray` → `normalizeConfigElementArray`
 * - `Struct`             → `normalizeStructElement` (recurses into its children)
 * - All other types      → passed through unchanged
 */
// eslint-disable-next-line sonarjs/function-return-type
function normalizeElement(original: OriginalElement): DefinitionElement {
  const elementType = original.elementType as string;
  if (elementType === PARAMETER_ELEMENT_TYPE.StructArray) {
    return normalizeStructArray(original);
  }
  if (elementType === PARAMETER_ELEMENT_TYPE.ElementArray) {
    return normalizeConfigElementArray(original);
  }
  if (elementType === PARAMETER_ELEMENT_TYPE.Struct) {
    return normalizeStructElement(original);
  }
  return original as unknown as DefinitionElement;
}

function normalizeStructElement(original: OriginalElement): StructElement {
  const {elements, children, ...rest} = original;
  const rawChildren =
    (elements as OriginalElement[] | undefined) ??
    (children as OriginalElement[] | undefined) ??
    [];
  return {
    ...rest,
    elementType: PARAMETER_ELEMENT_TYPE.Struct,
    elements: rawChildren.map(child => normalizeElement(child)),
  } as unknown as StructElement;
}

/**
 * Normalizes a raw `StructArray` element into a typed `StructArray`.
 *
 * The `keyStructureDefinition` sibling field becomes the `StructElement` template.
 * Its child elements are stored under `children` in the source JSON and are
 * remapped to `elements` as required by `StructElement`.
 */
function normalizeStructArray(original: OriginalElement): StructArray {
  // Destructure keyStructureDefinition out so it is not carried over into the
  // normalized StructArray — it is converted to `template` instead.
  const {keyStructureDefinition, ...rest} = original;
  const keyStructDef = keyStructureDefinition as OriginalElement;
  // Destructure `children` out of keyStructDef so it does not appear as an
  // extra field in the StructElement template alongside `elements`.
  const {children, ...keyStructFields} = keyStructDef;
  const rawChildren = (children as OriginalElement[] | undefined) ?? [];
  const template: StructElement = {
    ...keyStructFields,
    elementType: PARAMETER_ELEMENT_TYPE.Struct,
    // Source JSON uses "children" for child elements; StructElement uses "elements".
    // Each child is normalized recursively so nested arrays get their `template`.
    elements: rawChildren.map(child => normalizeElement(child)),
  } as unknown as StructElement;
  return {
    ...rest,
    elementType: PARAMETER_ELEMENT_TYPE.StructArray,
    template,
  } as unknown as StructArray;
}

/**
 * Normalizes a raw `ConfigElementArray` element into a typed `ElementArray`.
 *
 * The element itself becomes the `ConfigElement` template — same fields,
 * with `elementType` changed to `'ConfigElement'`.
 */
function normalizeConfigElementArray(original: OriginalElement): ElementArray {
  const template: ConfigElement = {
    ...original,
    elementType: PARAMETER_ELEMENT_TYPE.ConfigElement,
  } as unknown as ConfigElement;
  return {
    ...original,
    elementType: PARAMETER_ELEMENT_TYPE.ElementArray,
    template,
  } as unknown as ElementArray;
}

/**
 * Parses binary parameter payloads into structured `ElementData` trees.
 *
 * Reads `payload` bytes sequentially according to the `paramStructure` JSON schema
 * stored in `SpfModuleParameterDefinitionRow.paramStructure`. `paramStructure` is
 * validated in the DB layer before storage, so no re-validation is performed here.
 *
 * Supported element types:
 * - `ConfigElement` — scalar value (UInt8/16/32/64, Int8/16/32/64, Float, Double, RawData)
 * - `Struct` — named group of child elements parsed in order
 * - `ElementArray` — fixed-length or formula-driven array of scalar items
 * - `StructArray` — fixed-length or formula-driven array of struct items
 *
 * On any error (malformed JSON, buffer overflow, or other runtime error),
 * returns a single `Failed to parse payload` `ConfigElementData` containing the full payload as a
 * hex string rather than throwing.
 *
 * @param payload - Raw binary data from `CkvParameterPayloadRow.payload`
 * @param paramStructure - JSON string from `SpfModuleParameterDefinitionRow.paramStructure`
 * @param logger - Optional logger; when provided, a warning is emitted on parse failure
 * @returns Array of parsed elements, or a single `Failed to parse payload` fallback on any error
 */
export function parseParameterData(
  payload: Uint8Array,
  paramStructure: string,
  logger?: Logger,
): ElementData[] {
  try {
    const definitions = convertParamDefinition(paramStructure);
    const reader = new BinaryDataReader(payload);
    const parsed: ElementData[] = [];
    for (const element of definitions) {
      parsed.push(parseElement(element, reader, parsed));
    }
    return parsed;
  } catch (error) {
    logger?.logWarn({
      component: 'parseParameterData',
      action: 'parse-parameter-data',
      tag: 'param-parser',
      timestamp: new Date(),
      msg: `Failed to parse parameter data, falling back to raw hex: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
    return [rawFallback(payload)];
  }
}

/**
 * Dispatches parsing to the appropriate handler based on `elementType`.
 * `parsedSoFar` is passed through so formula-driven array lengths can
 * reference previously parsed scalar values by name.
 */
function parseElement(
  element: DefinitionElement,
  reader: BinaryDataReader,
  parsedSoFar: ElementData[],
): ElementData {
  if (element.alignment) {
    reader.align(element.alignment);
  }
  switch (element.elementType) {
    case 'ConfigElement':
      return parseConfigElement(element, reader);
    case 'Struct':
      return parseStruct(element, reader, parsedSoFar);
    case 'ConfigElementArray':
      return parseArrayElement(element, reader, parsedSoFar);
    case 'StructArray':
      return parseArrayElement(element, reader, parsedSoFar);
  }
}

/**
 * Reads a single scalar value from the binary stream and wraps it in a
 * `ConfigElementData`. The value is stored as a string to match the DTO contract.
 * For `RawData`, all remaining bytes are consumed and stored as a comma-separated
 * decimal string.
 */
function parseConfigElement(
  element: ConfigElement,
  reader: BinaryDataReader,
): ConfigElementData {
  const raw = readScalar(element.dataType, reader);
  const value =
    raw instanceof Uint8Array ? [...raw].toString() : raw.toString();
  return {
    type: PARAMETER_ELEMENT_TYPE.ConfigElement,
    name: element.name ?? '',
    description: element.description,
    group: element.group,
    subgroup: element.subgroup,
    isReadOnly: element.isReadOnly ?? false,
    dataType: element.dataType,
    unit: element.unitStr,
    displayType: element.displayType,
    policy: element.policy,
    qFormat: element.qFormat,
    precision: element.precision,
    defaultValue: element.defaultValue,
    min: parseMinMax(element.min, element.dataType),
    max: parseMinMax(element.max, element.dataType),
    rangeList: element.rangeList,
    dependentOnElements: element.dependentOnElements,
    alignment: element.alignment,
    channel: element.channel,
    groupSet: element.groupSet,
    rtmPlotType: element.rtmPlotType,
    copySrc: element.copySrc,
    displayName: element.displayName,
    linkedByForFormula: element.linkedByForFormula,
    defaultDataDepends: element.defaultDataDepends,
    value,
  };
}

/** Reads the next scalar value of the given `dataType` from the binary stream. */
// eslint-disable-next-line sonarjs/function-return-type
function readScalar(
  dataType: string,
  reader: BinaryDataReader,
): number | bigint | Uint8Array {
  switch (dataType) {
    case 'UInt8':
      return reader.readUInt8();
    case 'UInt16':
      return reader.readUInt16();
    case 'UInt32':
      return reader.readUInt32();
    case 'UInt64':
      return reader.readUInt64();
    case 'Int8':
      return reader.readInt8();
    case 'Int16':
      return reader.readInt16();
    case 'Int32':
      return reader.readInt32();
    case 'Int64':
      return reader.readInt64();
    case 'Float':
      return reader.readFloat();
    case 'Double':
      return reader.readDouble();
    case 'RawData':
      return reader.readRawData(reader.getRemainingBytes());
    default:
      throw new Error(`Unknown dataType: ${dataType}`);
  }
}

/**
 * Parses a `Struct` element by recursively parsing each child element in order.
 * Children are accumulated and passed as `parsedSoFar` context to later siblings
 * so that formula references within the struct can resolve correctly.
 */
function parseStruct(
  element: StructElement,
  reader: BinaryDataReader,
  parsedSoFar: ElementData[],
): StructData {
  const context: ElementData[] = [...parsedSoFar];
  const children: ElementData[] = [];
  for (const child of element.elements) {
    const parsed = parseElement(child, reader, context);
    children.push(parsed);
    context.push(parsed);
  }
  return {
    type: PARAMETER_ELEMENT_TYPE.Struct,
    name: element.name,
    description: element.description,
    group: element.group,
    subgroup: element.subgroup,
    isReadOnly: false,
    structType: element.structureType,
    alignment: element.alignment,
    channel: element.channel,
    groupSet: element.groupSet,
    rtmPlotType: element.rtmPlotType,
    copySrc: element.copySrc,
    value: children,
  };
}

/**
 * Parses an `ElementArray` or `StructArray` by determining its length, then
 * parsing each item using `element.template` as the definition.
 * Items are named `<arrayName>[i]`.
 */
function parseArrayElement(
  element: ElementArray | StructArray,
  reader: BinaryDataReader,
  parsedSoFar: ElementData[],
): ElementArrayData {
  const formulaLength = computeArrayLength(
    element.arrayLenFormulaStr ?? '',
    parsedSoFar,
  );
  const length = formulaLength > 0 ? formulaLength : (element.arrayLength ?? 0);

  const arrayName = element.name;
  const templateElement = buildTemplateElement(element.template, arrayName);
  const structType =
    element.elementType === PARAMETER_ELEMENT_TYPE.StructArray
      ? element.template.structureType
      : undefined;

  const items: ElementData[] = [];
  const context: ElementData[] = [...parsedSoFar];
  for (let i = 0; i < length; i++) {
    const parsed = parseTemplateItem(
      element.template,
      reader,
      context,
      arrayName,
      i,
    );
    items.push(parsed);
    context.push(parsed);
  }

  return {
    type: PARAMETER_ELEMENT_TYPE.ElementArray,
    name: arrayName,
    description: element.description,
    group: element.group,
    subgroup: element.subgroup,
    isReadOnly: element.isReadOnly ?? false,
    structType,
    alignment: element.alignment,
    channel: element.channel,
    groupSet: element.groupSet,
    rtmPlotType: element.rtmPlotType,
    copySrc: element.copySrc,
    copySrcInfoList: element.copySrcInfoList,
    displayType: element.displayType,
    policy: element.policy,
    template: [templateElement],
    value: items,
    length,
    arrayLenFormulaStr: element.arrayLenFormulaStr,
  };
}

/**
 * Builds a `ElementData` descriptor from a single `DefinitionElement`.
 * Used to populate the `template` field of `ElementArrayData`.
 * For `ConfigElement`, `value` is set to `defaultValue ?? ''`.
 * For `Struct`, `value` is set to `[]` (no binary data to parse for the template).
 * For nested arrays, `value` and `template` are empty.
 */
function buildTemplateElement(
  element: DefinitionElement,
  arrayName: string,
): ElementData {
  const name = element.name ?? arrayName;
  switch (element.elementType) {
    case 'ConfigElement':
      return {
        type: PARAMETER_ELEMENT_TYPE.ConfigElement,
        name,
        description: element.description,
        group: element.group,
        subgroup: element.subgroup,
        isReadOnly: element.isReadOnly ?? false,
        dataType: element.dataType,
        value: element.defaultValue ?? '',
        unit: element.unitStr,
        displayType: element.displayType,
        policy: element.policy,
        qFormat: element.qFormat,
        precision: element.precision,
        defaultValue: element.defaultValue,
        min: parseMinMax(element.min, element.dataType),
        max: parseMinMax(element.max, element.dataType),
        rangeList: element.rangeList,
        dependentOnElements: element.dependentOnElements,
        alignment: element.alignment,
        channel: element.channel,
        groupSet: element.groupSet,
        rtmPlotType: element.rtmPlotType,
        copySrc: element.copySrc,
        displayName: element.displayName,
        linkedByForFormula: element.linkedByForFormula,
        defaultDataDepends: element.defaultDataDepends,
      };
    case 'Struct':
      return {
        type: PARAMETER_ELEMENT_TYPE.Struct,
        name,
        isReadOnly: false,
        description: element.description,
        group: element.group,
        subgroup: element.subgroup,
        structType: element.structureType,
        alignment: element.alignment,
        channel: element.channel,
        groupSet: element.groupSet,
        rtmPlotType: element.rtmPlotType,
        copySrc: element.copySrc,
        value: element.elements.map(child =>
          buildTemplateElement(child, child.name ?? name),
        ),
      };
    case 'ConfigElementArray':
      return {
        type: PARAMETER_ELEMENT_TYPE.ElementArray,
        name,
        isReadOnly: element.isReadOnly ?? false,
        description: element.description,
        group: element.group,
        subgroup: element.subgroup,
        alignment: element.alignment,
        channel: element.channel,
        groupSet: element.groupSet,
        rtmPlotType: element.rtmPlotType,
        copySrc: element.copySrc,
        copySrcInfoList: element.copySrcInfoList,
        displayType: element.displayType,
        policy: element.policy,
        template: [buildTemplateElement(element.template, name)],
        value: [],
        length: element.arrayLength,
        arrayLenFormulaStr: element.arrayLenFormulaStr,
      };
    case 'StructArray':
      return {
        type: PARAMETER_ELEMENT_TYPE.ElementArray,
        name,
        isReadOnly: element.isReadOnly ?? false,
        structType: element.template.structureType,
        description: element.description,
        group: element.group,
        subgroup: element.subgroup,
        alignment: element.alignment,
        channel: element.channel,
        groupSet: element.groupSet,
        rtmPlotType: element.rtmPlotType,
        copySrc: element.copySrc,
        copySrcInfoList: element.copySrcInfoList,
        displayType: element.displayType,
        policy: element.policy,
        template: [buildTemplateElement(element.template, name)],
        value: [],
        length: element.arrayLength,
        arrayLenFormulaStr: element.arrayLenFormulaStr,
      };
  }
}

/**
 * Parses a single array item at the given `index` using `template` as the
 * item element definition. The item is given the name `<arrayName>[index]`.
 */
function parseTemplateItem(
  template: DefinitionElement,
  reader: BinaryDataReader,
  parsedSoFar: ElementData[],
  arrayName: string,
  index: number,
): ElementData {
  const namedTemplate: DefinitionElement = {
    ...template,
    name: `${template.name ?? arrayName}[${index}]`,
  };
  return parseElement(namedTemplate, reader, parsedSoFar);
}

/**
 * Resolves an `arrayLenFormulaStr` expression to a concrete array length by
 * building a variable map from previously parsed `ConfigElement` values and
 * delegating to `evaluateFormula`. Returns `0` on any error.
 */
function computeArrayLength(
  formula: string,
  parsedElements: ElementData[],
): number {
  const trimmed = formula.trim();
  if (!trimmed) return 0;

  const variables = new Map<string, number>();
  for (const el of parsedElements) {
    if (el.type === PARAMETER_ELEMENT_TYPE.ConfigElement) {
      const num = Number.parseFloat(el.value);
      if (!Number.isNaN(num)) {
        variables.set(el.name, num);
      }
    }
  }

  try {
    return Math.trunc(evaluateFormula(trimmed, variables));
  } catch {
    return 0;
  }
}
