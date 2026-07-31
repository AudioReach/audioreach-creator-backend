/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {AwspParser} from './awsp-parser.js';
import {
  DEFINITION_BLOCK_NAMES,
  FILE_NAMES,
  FILE_EXTENSIONS,
} from '../../shared/constants/definition-block-names.js';
import type {FileSystemPort} from '../../../ports/file-system/file-system.port.js';
import type {PathRef} from '../../shared/utils/file-ref.js';
import type {
  JsonValue,
  JsonObject,
} from '../../../../shared/types/json-types.js';

/**
 * A single semantic difference found while comparing two parsed AWSP files.
 */
export interface AwspComparisonMismatch {
  /** Which JSON block the mismatch belongs to, e.g. "awsp:keys" or "awsp:configuration". */
  domain: string;
  /** Human-readable description including a path to the differing element. */
  detail: string;
}

/**
 * Result of comparing two AWSP files at the raw JSON level.
 */
export interface AwspComparisonResult {
  /** True when no domain reported any mismatch. */
  equal: boolean;
  /** All mismatches found across definitions.json and configuration.json. */
  mismatches: AwspComparisonMismatch[];
  /**
   * Informational notes about known gaps (e.g. AwspFileSerializer.serialize()
   * currently emitting empty JSON files) — do not affect `equal`.
   */
  unsupportedDomainNotes: string[];
}

/**
 * Compare two AWSP files (upload vs. re-download) by diffing the raw JSON
 * content of definitions.json and configuration.json inside each ZIP payload.
 *
 * Deliberately does NOT go through {@link AwspParser.parseDefinitions} or
 * `Configuration.fromJSON()` — those run the data through zod schemas that
 * can silently coerce types, apply defaults, or drop unrecognized fields,
 * which would hide a real round-trip regression. Only
 * {@link AwspParser.parseEnvelope} is reused (pure binary-envelope unwrapping,
 * no data validation) to get at the ZIP payload; everything after that is
 * read as plain JSON and diffed structurally.
 *
 * Array blocks (keys, tags, spfProperties, driverProperties, spfModules,
 * driverModules, vcpmModuleDefinitions, processors, containerTypes) are
 * matched by their `id` field rather than array index, since ordering is not
 * guaranteed to match between the original and re-downloaded file.
 */
export async function compareAwspFiles(
  fileSystem: FileSystemPort,
  originalAwspRef: PathRef,
  downloadedAwspRef: PathRef,
): Promise<AwspComparisonResult> {
  const parser = new AwspParser();

  const [originalUnzipDir, downloadedUnzipDir] = await Promise.all([
    unzipAwspToTempFolder(fileSystem, parser, originalAwspRef, 'original'),
    unzipAwspToTempFolder(fileSystem, parser, downloadedAwspRef, 'downloaded'),
  ]);

  try {
    const [
      originalDefinitions,
      downloadedDefinitions,
      originalConfiguration,
      downloadedConfiguration,
    ] = await Promise.all([
      readJsonFile(
        fileSystem,
        fileSystem.joinPath(originalUnzipDir, FILE_NAMES.DEFINITIONS_JSON),
      ),
      readJsonFile(
        fileSystem,
        fileSystem.joinPath(downloadedUnzipDir, FILE_NAMES.DEFINITIONS_JSON),
      ),
      readJsonFile(
        fileSystem,
        fileSystem.joinPath(originalUnzipDir, FILE_NAMES.CONFIGURATION_JSON),
      ),
      readJsonFile(
        fileSystem,
        fileSystem.joinPath(downloadedUnzipDir, FILE_NAMES.CONFIGURATION_JSON),
      ),
    ]);

    const results = await Promise.all([
      ...Object.values(DEFINITION_BLOCK_NAMES).map(blockName =>
        Promise.resolve(
          compareDefinitionBlock(
            blockName,
            originalDefinitions,
            downloadedDefinitions,
          ),
        ),
      ),
      Promise.resolve(
        compareConfiguration(originalConfiguration, downloadedConfiguration),
      ),
    ]);
    const mismatches: AwspComparisonMismatch[] = results.flat();

    const unsupportedDomainNotes: string[] = [];
    if (
      Object.keys(downloadedDefinitions).length === 0 &&
      Object.keys(originalDefinitions).length > 0
    ) {
      unsupportedDomainNotes.push(
        'AWSP definitions.json is empty in the downloaded file — the download ' +
          'pipeline does not currently serialize AWSP definitions (known gap, not a regression).',
      );
    }
    if (
      Object.keys(downloadedConfiguration).length === 0 &&
      Object.keys(originalConfiguration).length > 0
    ) {
      unsupportedDomainNotes.push(
        'AWSP configuration.json is empty in the downloaded file — the download ' +
          'pipeline does not currently serialize AWSP configuration (known gap, not a regression).',
      );
    }

    return {
      equal: mismatches.length === 0,
      mismatches,
      unsupportedDomainNotes,
    };
  } finally {
    fileSystem.deleteDirectory(originalUnzipDir);
    fileSystem.deleteDirectory(downloadedUnzipDir);
  }
}

function compareDefinitionBlock(
  blockName: string,
  originalDefinitions: JsonObject,
  downloadedDefinitions: JsonObject,
): AwspComparisonMismatch[] {
  const mismatches: AwspComparisonMismatch[] = [];
  diffJsonArray(
    `awsp:${blockName}`,
    blockName,
    asArray(originalDefinitions[blockName]),
    asArray(downloadedDefinitions[blockName]),
    mismatches,
  );
  return mismatches;
}

function compareConfiguration(
  originalConfiguration: JsonObject,
  downloadedConfiguration: JsonObject,
): AwspComparisonMismatch[] {
  const mismatches: AwspComparisonMismatch[] = [];
  diffJsonObject(
    'awsp:configuration',
    'configuration',
    originalConfiguration,
    downloadedConfiguration,
    mismatches,
  );
  return mismatches;
}

async function unzipAwspToTempFolder(
  fileSystem: FileSystemPort,
  parser: AwspParser,
  awspRef: PathRef,
  label: 'original' | 'downloaded',
): Promise<string> {
  const bytes = await fileSystem.readAll(awspRef);
  const {zipData} = parser.parseEnvelope(bytes);

  const fileDir = fileSystem.dirname(awspRef.uri);
  const fileName = fileSystem.basename(awspRef.uri, FILE_EXTENSIONS.AWSP);
  const folderName = `${fileName}_cmp_${label}_${Date.now()}`;
  const folderPath = fileSystem.joinPath(fileDir, folderName);

  await fileSystem.unzipBuffer(zipData, folderPath);
  return folderPath;
}

async function readJsonFile(
  fileSystem: FileSystemPort,
  filePath: string,
): Promise<JsonObject> {
  const exists = await fileSystem.exists(filePath);
  if (!exists) return {};

  const ref: PathRef = {kind: 'path', name: filePath, uri: filePath};
  const bytes = await fileSystem.readAll(ref);
  const text = new TextDecoder('utf8').decode(bytes);

  let parsed: JsonValue;
  try {
    parsed = JSON.parse(text) as JsonValue;
  } catch {
    return {};
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {};
  }
  return parsed as JsonObject;
}

function asArray(value: JsonValue | undefined): JsonValue[] {
  return Array.isArray(value) ? value : [];
}

function isPlainObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepEqualJson(a: JsonValue, b: JsonValue): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((value, i) => deepEqualJson(value, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(key => key in b && deepEqualJson(a[key], b[key]));
  }
  return false;
}

function shortJson(value: JsonValue): string {
  const text = JSON.stringify(value);
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

function diffJsonValue(
  domain: string,
  path: string,
  a: JsonValue,
  b: JsonValue,
  mismatches: AwspComparisonMismatch[],
): void {
  if (deepEqualJson(a, b)) return;

  if (Array.isArray(a) && Array.isArray(b)) {
    diffJsonArray(domain, path, a, b, mismatches);
    return;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    diffJsonObject(domain, path, a, b, mismatches);
    return;
  }

  mismatches.push({
    domain,
    detail: `${path}: value differs (original=${shortJson(a)}, downloaded=${shortJson(b)})`,
  });
}

function diffJsonObject(
  domain: string,
  path: string,
  a: JsonObject,
  b: JsonObject,
  mismatches: AwspComparisonMismatch[],
): void {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const childPath = `${path}.${key}`;
    const inA = key in a;
    const inB = key in b;
    if (!inA) {
      mismatches.push({
        domain,
        detail: `${childPath} present only in downloaded file`,
      });
      continue;
    }
    if (!inB) {
      mismatches.push({
        domain,
        detail: `${childPath} present only in original file`,
      });
      continue;
    }
    diffJsonValue(domain, childPath, a[key], b[key], mismatches);
  }
}

function isKeyedEntity(v: JsonValue): v is JsonObject {
  return isPlainObject(v) && 'id' in v;
}

function entityId(entity: JsonObject): string {
  const id = entity['id'];
  return typeof id === 'string' ? id : JSON.stringify(id);
}

function diffIndexedArray(
  domain: string,
  path: string,
  a: JsonValue[],
  b: JsonValue[],
  mismatches: AwspComparisonMismatch[],
): void {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const itemPath = `${path}[${i}]`;
    if (i >= a.length) {
      mismatches.push({
        domain,
        detail: `${itemPath} present only in downloaded file`,
      });
      continue;
    }
    if (i >= b.length) {
      mismatches.push({
        domain,
        detail: `${itemPath} present only in original file`,
      });
      continue;
    }
    diffJsonValue(domain, itemPath, a[i], b[i], mismatches);
  }
}

/**
 * Diff two JSON arrays. When every element on both sides is an object with
 * an `id` field, elements are matched by `id` (order-independent) — matching
 * the natural key every AWSP definition block schema uses (see
 * `*.schema.ts` files under shared/awsp-serializers/v1/definitions/).
 * Otherwise falls back to index-based comparison.
 */
function diffJsonArray(
  domain: string,
  path: string,
  a: JsonValue[],
  b: JsonValue[],
  mismatches: AwspComparisonMismatch[],
): void {
  const keyed =
    a.length > 0 &&
    b.length > 0 &&
    a.every(v => isKeyedEntity(v)) &&
    b.every(v => isKeyedEntity(v));

  if (!keyed) {
    diffIndexedArray(domain, path, a, b, mismatches);
    return;
  }

  const mapB = new Map(b.map(el => [entityId(el as JsonObject), el]));
  const matchedKeys = new Set<string>();

  for (const elA of a) {
    const key = entityId(elA as JsonObject);
    const itemPath = `${path}[id=${key}]`;
    const elB = mapB.get(key);
    if (elB === undefined) {
      mismatches.push({
        domain,
        detail: `${itemPath} present only in original file`,
      });
      continue;
    }
    matchedKeys.add(key);
    diffJsonValue(domain, itemPath, elA, elB, mismatches);
  }

  for (const elB of b) {
    const key = entityId(elB as JsonObject);
    if (!matchedKeys.has(key)) {
      mismatches.push({
        domain,
        detail: `${path}[id=${key}] present only in downloaded file`,
      });
    }
  }
}
