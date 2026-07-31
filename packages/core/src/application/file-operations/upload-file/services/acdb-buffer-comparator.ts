/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {AcdbFileOrchestrator} from './acdb-file-orchestrator.js';
import type {ParsedAcdb} from '../models/parsed-acdb.js';
import {
  PARSED_CHUNK_TYPES,
  type ParsedChunkType,
} from '../../shared/constants/chunk-types.js';
import type {HeaderChunk} from '../../shared/acdb-chunks/header-chunk.js';
import type {UsecaseDataChunk} from '../../shared/acdb-chunks/usecase-data-chunk.js';
import type {SubgraphDataChunk} from '../../shared/acdb-chunks/subgraph-data-chunk.js';
import type {DatapoolChunk} from '../../shared/acdb-chunks/datapool-chunk.js';
import type {AudioCalibrationChunk} from '../../shared/acdb-chunks/audio-calibration-chunk.js';
import type {VoiceCalibrationChunk} from '../../shared/acdb-chunks/voice-calibration-chunk.js';
import type {DriverCalibrationChunk} from '../../shared/acdb-chunks/driver-calibration-chunk.js';
import type {TagDataChunk} from '../../shared/acdb-chunks/tag-data-chunk.js';
import type {TaggedModuleMapChunk} from '../../shared/acdb-chunks/tagged-module-map-chunk.js';
import type {SubgraphConfigProperty} from '../../shared/acdb-chunks/spf-properties/subgraph-config-property.js';
import type {ContainerConfigProperty} from '../../shared/acdb-chunks/spf-properties/container-config-property.js';
import type {ModuleListProperty} from '../../shared/acdb-chunks/spf-properties/module-list-property.js';
import type {ModulePortProperty} from '../../shared/acdb-chunks/spf-properties/module-port-property.js';
import type {DataLinksProperty} from '../../shared/acdb-chunks/spf-properties/data-links-property.js';
import type {ControlLinksProperty} from '../../shared/acdb-chunks/spf-properties/control-links-property.js';
import type {VcpmConfigProperty} from '../../shared/acdb-chunks/spf-properties/vcpm-config-property.js';
import type {SpfProperties} from '../../shared/acdb-chunks/spf-properties/spf-properties.js';
import {BinaryUtils} from '../../../../shared/utilities/binary-utils.js';
import {compareNumberArrays} from '../../../../shared/utilities/array-utils.js';
import type {Logger} from '../../../../shared/types/logger.interface.js';

/**
 * A single semantic difference found while comparing two parsed ACDB buffers.
 */
export interface AcdbComparisonMismatch {
  /** Which chunk domain the mismatch belongs to, e.g. "audioCalibration". */
  domain: string;
  /** Human-readable description including a path to the differing element. */
  detail: string;
}

/**
 * Result of comparing two ACDB buffers at the semantic (dereferenced) chunk level.
 */
export interface AcdbComparisonResult {
  /** True when no domain reported any mismatch. */
  equal: boolean;
  /** All mismatches found across every compared domain. */
  mismatches: AcdbComparisonMismatch[];
  /**
   * Informational notes about chunk types that exist in one file but are not
   * currently produced by the download pipeline (e.g. MODULE_MANAGER, BOOTUP_LOADING).
   * These do not affect `equal` — they are known gaps, not regressions.
   */
  unsupportedDomainNotes: string[];
}

/**
 * Compare two ACDB files at the semantic chunk level (upload vs. re-download,
 * or any two buffers that should describe the same data).
 *
 * Byte-for-byte comparison of the raw buffers is not meaningful here: the
 * download serializer rebuilds the datapool and reassigns every offset from
 * scratch, and internal grouping order is not guaranteed to match the
 * original file's row order. Instead, both buffers are parsed with
 * {@link AcdbFileOrchestrator}, and every chunk's own accessor methods
 * (`getCalKeyTable`, `getCkvLookupTable`, `getDataAtOffset`, etc.) are used to
 * dereference offsets on both sides at the moment of comparison — offsets
 * themselves are never compared directly.
 *
 * Only domains the download pipeline currently produces are compared:
 * header, usecase/GKV data, subgraph data (SPF properties), audio
 * calibration, voice calibration, driver calibration, tag data, and tagged
 * module map. Chunk types the download pipeline does not yet serialize
 * (SUBGRAPH_PAIR_DATA, MODULE_MANAGER, BOOTUP_LOADING, GKV_ALIAS) are
 * reported as informational notes rather than mismatches.
 */
export async function compareAcdbBuffers(
  originalBuffer: Uint8Array,
  downloadedBuffer: Uint8Array,
  logger?: Logger,
): Promise<AcdbComparisonResult> {
  const orchestrator = new AcdbFileOrchestrator(undefined, logger);
  const [original, downloaded] = await Promise.all([
    orchestrator.parseACDBBytes(originalBuffer),
    orchestrator.parseACDBBytes(downloadedBuffer),
  ]);

  const results = await Promise.all([
    Promise.resolve(compareHeader(original, downloaded)),
    Promise.resolve(compareUsecaseData(original, downloaded)),
    Promise.resolve(compareSubgraphData(original, downloaded)),
    Promise.resolve(compareAudioCalibration(original, downloaded)),
    Promise.resolve(compareVoiceCalibration(original, downloaded)),
    Promise.resolve(compareDriverCalibration(original, downloaded)),
    Promise.resolve(compareTagData(original, downloaded)),
    Promise.resolve(compareTaggedModuleMap(original, downloaded)),
  ]);
  const mismatches: AcdbComparisonMismatch[] = results.flat();

  return {
    equal: mismatches.length === 0,
    mismatches,
    unsupportedDomainNotes: collectUnsupportedDomainNotes(original, downloaded),
  };
}

// ── Generic helpers ─────────────────────────────────────────────────────────

/**
 * Match two collections by a natural key, independent of order or index
 * alignment. Presence-only differences are reported separately from paired
 * elements so callers can recurse into pairs for deeper comparison.
 */
function diffByKey<T>(
  itemsA: readonly T[],
  itemsB: readonly T[],
  keyOf: (item: T) => string,
): {onlyInA: T[]; onlyInB: T[]; pairs: Array<[T, T]>} {
  const mapB = new Map(itemsB.map(item => [keyOf(item), item] as const));
  const matchedBKeys = new Set<string>();
  const onlyInA: T[] = [];
  const pairs: Array<[T, T]> = [];

  for (const itemA of itemsA) {
    const key = keyOf(itemA);
    const itemB = mapB.get(key);
    if (itemB === undefined) {
      onlyInA.push(itemA);
    } else {
      pairs.push([itemA, itemB]);
      matchedBKeys.add(key);
    }
  }

  const onlyInB = itemsB.filter(itemB => !matchedBKeys.has(keyOf(itemB)));
  return {onlyInA, onlyInB, pairs};
}

function bytesEqual(
  a: Uint8Array | null | undefined,
  b: Uint8Array | null | undefined,
): boolean {
  if (!a || !b) return a === b;
  if (a.length !== b.length) return false;
  for (const [i, element] of a.entries()) {
    if (element !== b[i]) return false;
  }
  return true;
}

/** Compare two propertyId -> payload maps (order-independent), byte-for-byte. */
function compareByteMaps(
  domain: string,
  path: string,
  mapA: Map<number, Uint8Array>,
  mapB: Map<number, Uint8Array>,
): AcdbComparisonMismatch[] {
  const mismatches: AcdbComparisonMismatch[] = [];
  for (const key of mapA.keys()) {
    if (!mapB.has(key)) {
      mismatches.push({
        domain,
        detail: `${path}.property[${BinaryUtils.toHexString(key)}] present only in original file`,
      });
    }
  }
  for (const key of mapB.keys()) {
    if (!mapA.has(key)) {
      mismatches.push({
        domain,
        detail: `${path}.property[${BinaryUtils.toHexString(key)}] present only in downloaded file`,
      });
    }
  }
  for (const key of mapA.keys()) {
    if (mapB.has(key) && !bytesEqual(mapA.get(key), mapB.get(key))) {
      mismatches.push({
        domain,
        detail: `${path}.property[${BinaryUtils.toHexString(key)}] payload differs`,
      });
    }
  }
  return mismatches;
}

// ── Header ───────────────────────────────────────────────────────────────

function compareHeader(a: ParsedAcdb, b: ParsedAcdb): AcdbComparisonMismatch[] {
  const domain = 'header';
  const headerA = a.getChunk<HeaderChunk>(PARSED_CHUNK_TYPES.HEADER);
  const headerB = b.getChunk<HeaderChunk>(PARSED_CHUNK_TYPES.HEADER);
  if (!headerA && !headerB) return [];
  if (!headerA || !headerB) {
    return [{domain, detail: 'HEADER chunk present in only one file'}];
  }

  const mismatches: AcdbComparisonMismatch[] = [];
  const va = headerA.version;
  const vb = headerB.version;
  if (
    va.major !== vb.major ||
    va.minor !== vb.minor ||
    va.revision !== vb.revision ||
    va.cplInfo !== vb.cplInfo
  ) {
    mismatches.push({
      domain,
      detail: `version differs (original=${va.major}.${va.minor}.${va.revision}.${va.cplInfo}, downloaded=${vb.major}.${vb.minor}.${vb.revision}.${vb.cplInfo})`,
    });
  }

  if (headerA.codecInfos.length !== headerB.codecInfos.length) {
    mismatches.push({
      domain,
      detail: `codecInfos count differs (original=${headerA.codecInfos.length}, downloaded=${headerB.codecInfos.length})`,
    });
  } else {
    for (let i = 0; i < headerA.codecInfos.length; i++) {
      const ca = headerA.codecInfos[i];
      const cb = headerB.codecInfos[i];
      if (
        ca.codecId !== cb.codecId ||
        ca.majorVersion !== cb.majorVersion ||
        ca.minorVersion !== cb.minorVersion
      ) {
        mismatches.push({domain, detail: `codecInfos[${i}] differs`});
      }
    }
  }

  if (headerA.modifiedDate !== headerB.modifiedDate) {
    mismatches.push({
      domain,
      detail: `modifiedDate differs (original=${headerA.modifiedDate}, downloaded=${headerB.modifiedDate})`,
    });
  }
  if (headerA.oemInfo !== headerB.oemInfo) {
    mismatches.push({
      domain,
      detail: `oemInfo differs (original="${headerA.oemInfo}", downloaded="${headerB.oemInfo}")`,
    });
  }

  return mismatches;
}

// ── Usecase / GKV data ──────────────────────────────────────────────────

function compareUsecaseData(
  a: ParsedAcdb,
  b: ParsedAcdb,
): AcdbComparisonMismatch[] {
  const domain = 'usecaseData';
  const chunkA = a.getChunk<UsecaseDataChunk>(PARSED_CHUNK_TYPES.USECASE_DATA);
  const chunkB = b.getChunk<UsecaseDataChunk>(PARSED_CHUNK_TYPES.USECASE_DATA);
  if (!chunkA && !chunkB) return [];
  if (!chunkA || !chunkB) {
    return [{domain, detail: 'GKV_TABLE/GKV_LUT present in only one file'}];
  }

  const mismatches: AcdbComparisonMismatch[] = [];
  // NOTE: keyed by (keyIds, valueIds); if the original file legitimately
  // contains duplicate key-value combinations (allowed by the format, see
  // usecase-data-chunk-builder.ts), only one such entry per key is compared.
  const diff = diffByKey(
    chunkA.usecases,
    chunkB.usecases,
    uc =>
      `${uc.keyValuePairList.keyList.join(',')}|${uc.keyValuePairList.valueList.join(',')}`,
  );

  for (const uc of diff.onlyInA) {
    mismatches.push({
      domain,
      detail: `usecase[keys=${uc.keyValuePairList.keyList.join(',')}, values=${uc.keyValuePairList.valueList.join(',')}] present only in original file`,
    });
  }
  for (const uc of diff.onlyInB) {
    mismatches.push({
      domain,
      detail: `usecase[keys=${uc.keyValuePairList.keyList.join(',')}, values=${uc.keyValuePairList.valueList.join(',')}] present only in downloaded file`,
    });
  }

  for (const [ucA, ucB] of diff.pairs) {
    const path = `usecase[keys=${ucA.keyValuePairList.keyList.join(',')}, values=${ucA.keyValuePairList.valueList.join(',')}]`;

    const sgListA = [...ucA.sgList].sort((x, y) => x - y);
    const sgListB = [...ucB.sgList].sort((x, y) => x - y);
    if (compareNumberArrays(sgListA, sgListB) !== 0) {
      mismatches.push({
        domain,
        detail: `${path}.sgList differs (original=[${sgListA.join(', ')}], downloaded=[${sgListB.join(', ')}])`,
      });
    }

    const pairsA = ucA.sgPairList
      .map(p => `${p.source}:${p.destination}`)
      .sort((a, b) => a.localeCompare(b));
    const pairsB = ucB.sgPairList
      .map(p => `${p.source}:${p.destination}`)
      .sort((a, b) => a.localeCompare(b));
    if (pairsA.join('|') !== pairsB.join('|')) {
      mismatches.push({
        domain,
        detail: `${path}.sgPairList differs (original=[${pairsA.join(', ')}], downloaded=[${pairsB.join(', ')}])`,
      });
    }
  }

  return mismatches;
}

// ── Subgraph data (SPF properties) ─────────────────────────────────────

function parseDriverProperties(payload: Uint8Array): {
  subgraphId: number;
  properties: Map<number, Uint8Array>;
} {
  const view = new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength,
  );
  let pos = 0;
  const subgraphId = BinaryUtils.readUint32(view, pos);
  pos += BinaryUtils.SIZEOF_UINT32;
  const numProperties = BinaryUtils.readUint32(view, pos);
  pos += BinaryUtils.SIZEOF_UINT32;

  const properties = new Map<number, Uint8Array>();
  for (let i = 0; i < numProperties; i++) {
    const propertyId = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;
    const length = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;
    properties.set(propertyId, payload.slice(pos, pos + length));
    pos += length;
  }

  return {subgraphId, properties};
}

function compareSubgraphConfig(
  domain: string,
  path: string,
  a: SubgraphConfigProperty | undefined,
  b: SubgraphConfigProperty | undefined,
): AcdbComparisonMismatch[] {
  if (!a && !b) return [];
  if (!a || !b) {
    return [
      {domain, detail: `${path}.subgraphConfig present in only one file`},
    ];
  }

  const mismatches: AcdbComparisonMismatch[] = [];
  const diff = diffByKey(a.subgraphProperties, b.subgraphProperties, sg =>
    String(sg.subgraphId),
  );
  for (const sg of diff.onlyInA) {
    mismatches.push({
      domain,
      detail: `${path}.subgraphConfig.subgraph[${sg.subgraphId}] present only in original file`,
    });
  }
  for (const sg of diff.onlyInB) {
    mismatches.push({
      domain,
      detail: `${path}.subgraphConfig.subgraph[${sg.subgraphId}] present only in downloaded file`,
    });
  }
  for (const [sgA, sgB] of diff.pairs) {
    mismatches.push(
      ...compareByteMaps(
        domain,
        `${path}.subgraphConfig.subgraph[${sgA.subgraphId}]`,
        sgA.properties,
        sgB.properties,
      ),
    );
  }
  return mismatches;
}

function compareContainerConfig(
  domain: string,
  path: string,
  a: ContainerConfigProperty | undefined,
  b: ContainerConfigProperty | undefined,
): AcdbComparisonMismatch[] {
  if (!a && !b) return [];
  if (!a || !b) {
    return [
      {domain, detail: `${path}.containerConfig present in only one file`},
    ];
  }

  const mismatches: AcdbComparisonMismatch[] = [];
  const diff = diffByKey(a.containerProperties, b.containerProperties, c =>
    String(c.containerId),
  );
  for (const c of diff.onlyInA) {
    mismatches.push({
      domain,
      detail: `${path}.containerConfig.container[${c.containerId}] present only in original file`,
    });
  }
  for (const c of diff.onlyInB) {
    mismatches.push({
      domain,
      detail: `${path}.containerConfig.container[${c.containerId}] present only in downloaded file`,
    });
  }
  for (const [cA, cB] of diff.pairs) {
    mismatches.push(
      ...compareByteMaps(
        domain,
        `${path}.containerConfig.container[${cA.containerId}]`,
        cA.properties,
        cB.properties,
      ),
    );
  }
  return mismatches;
}

function compareModuleList(
  domain: string,
  path: string,
  a: ModuleListProperty | undefined,
  b: ModuleListProperty | undefined,
): AcdbComparisonMismatch[] {
  if (!a && !b) return [];
  if (!a || !b) {
    return [{domain, detail: `${path}.moduleList present in only one file`}];
  }

  const mismatches: AcdbComparisonMismatch[] = [];
  const diff = diffByKey(
    a.spfModuleInfos,
    b.spfModuleInfos,
    info => `${info.subgraphId}:${info.containerId}`,
  );
  for (const info of diff.onlyInA) {
    mismatches.push({
      domain,
      detail: `${path}.moduleList[sg=${info.subgraphId},container=${info.containerId}] present only in original file`,
    });
  }
  for (const info of diff.onlyInB) {
    mismatches.push({
      domain,
      detail: `${path}.moduleList[sg=${info.subgraphId},container=${info.containerId}] present only in downloaded file`,
    });
  }
  for (const [infoA, infoB] of diff.pairs) {
    const modulePath = `${path}.moduleList[sg=${infoA.subgraphId},container=${infoA.containerId}]`;
    const moduleDiff = diffByKey(infoA.spfModules, infoB.spfModules, m =>
      String(m.instanceId),
    );
    for (const m of moduleDiff.onlyInA) {
      mismatches.push({
        domain,
        detail: `${modulePath}.module[instance=${m.instanceId}] present only in original file`,
      });
    }
    for (const m of moduleDiff.onlyInB) {
      mismatches.push({
        domain,
        detail: `${modulePath}.module[instance=${m.instanceId}] present only in downloaded file`,
      });
    }
    for (const [mA, mB] of moduleDiff.pairs) {
      if (mA.moduleId !== mB.moduleId) {
        mismatches.push({
          domain,
          detail: `${modulePath}.module[instance=${mA.instanceId}]: moduleId differs (original=${mA.moduleId}, downloaded=${mB.moduleId})`,
        });
      }
    }
  }
  return mismatches;
}

function compareModuleProperties(
  domain: string,
  path: string,
  a: ModulePortProperty | undefined,
  b: ModulePortProperty | undefined,
): AcdbComparisonMismatch[] {
  if (!a && !b) return [];
  if (!a || !b) {
    return [
      {domain, detail: `${path}.moduleProperties present in only one file`},
    ];
  }

  const mismatches: AcdbComparisonMismatch[] = [];
  const diff = diffByKey(a.modulePropertyConfigs, b.modulePropertyConfigs, c =>
    String(c.spfModuleInstanceId),
  );
  for (const c of diff.onlyInA) {
    mismatches.push({
      domain,
      detail: `${path}.moduleProperties[instance=${c.spfModuleInstanceId}] present only in original file`,
    });
  }
  for (const c of diff.onlyInB) {
    mismatches.push({
      domain,
      detail: `${path}.moduleProperties[instance=${c.spfModuleInstanceId}] present only in downloaded file`,
    });
  }
  for (const [cA, cB] of diff.pairs) {
    const mapA = new Map(cA.properties.map(p => [p.propertyId, p.data]));
    const mapB = new Map(cB.properties.map(p => [p.propertyId, p.data]));
    mismatches.push(
      ...compareByteMaps(
        domain,
        `${path}.moduleProperties[instance=${cA.spfModuleInstanceId}]`,
        mapA,
        mapB,
      ),
    );
  }
  return mismatches;
}

function compareDataLinks(
  domain: string,
  path: string,
  a: DataLinksProperty | undefined,
  b: DataLinksProperty | undefined,
): AcdbComparisonMismatch[] {
  if (!a && !b) return [];
  if (!a || !b) {
    return [{domain, detail: `${path}.dataLinks present in only one file`}];
  }

  const mismatches: AcdbComparisonMismatch[] = [];
  const diff = diffByKey(
    a.dataLinks,
    b.dataLinks,
    l =>
      `${l.sourceInstanceId}:${l.sourcePortId}:${l.destinationInstanceId}:${l.destinationPortId}`,
  );
  for (const l of diff.onlyInA) {
    mismatches.push({
      domain,
      detail: `${path}.dataLink[${l.sourceInstanceId}:${l.sourcePortId}->${l.destinationInstanceId}:${l.destinationPortId}] present only in original file`,
    });
  }
  for (const l of diff.onlyInB) {
    mismatches.push({
      domain,
      detail: `${path}.dataLink[${l.sourceInstanceId}:${l.sourcePortId}->${l.destinationInstanceId}:${l.destinationPortId}] present only in downloaded file`,
    });
  }
  for (const [lA, lB] of diff.pairs) {
    if (lA.isInterGraph !== lB.isInterGraph) {
      mismatches.push({
        domain,
        detail: `${path}.dataLink[${lA.sourceInstanceId}:${lA.sourcePortId}->${lA.destinationInstanceId}:${lA.destinationPortId}]: isInterGraph differs`,
      });
    }
  }
  return mismatches;
}

function compareControlLinks(
  domain: string,
  path: string,
  a: ControlLinksProperty | undefined,
  b: ControlLinksProperty | undefined,
): AcdbComparisonMismatch[] {
  if (!a && !b) return [];
  if (!a || !b) {
    return [{domain, detail: `${path}.controlLinks present in only one file`}];
  }

  const mismatches: AcdbComparisonMismatch[] = [];
  const diff = diffByKey(
    a.controlLinks,
    b.controlLinks,
    l =>
      `${l.peer1InstanceId}:${l.peer1PortId}:${l.peer2InstanceId}:${l.peer2PortId}`,
  );
  for (const l of diff.onlyInA) {
    mismatches.push({
      domain,
      detail: `${path}.controlLink[${l.peer1InstanceId}:${l.peer1PortId}<->${l.peer2InstanceId}:${l.peer2PortId}] present only in original file`,
    });
  }
  for (const l of diff.onlyInB) {
    mismatches.push({
      domain,
      detail: `${path}.controlLink[${l.peer1InstanceId}:${l.peer1PortId}<->${l.peer2InstanceId}:${l.peer2PortId}] present only in downloaded file`,
    });
  }
  for (const [lA, lB] of diff.pairs) {
    const linkPath = `${path}.controlLink[${lA.peer1InstanceId}:${lA.peer1PortId}<->${lA.peer2InstanceId}:${lA.peer2PortId}]`;
    if (lA.isInterGraph !== lB.isInterGraph) {
      mismatches.push({domain, detail: `${linkPath}: isInterGraph differs`});
    }
    if (lA.heapId !== lB.heapId) {
      mismatches.push({
        domain,
        detail: `${linkPath}: heapId differs (original=${lA.heapId}, downloaded=${lB.heapId})`,
      });
    }
    const intentsA = [...lA.intents].sort((x, y) => x - y);
    const intentsB = [...lB.intents].sort((x, y) => x - y);
    if (compareNumberArrays(intentsA, intentsB) !== 0) {
      mismatches.push({
        domain,
        detail: `${linkPath}: intents differ (original=[${intentsA.join(', ')}], downloaded=[${intentsB.join(', ')}])`,
      });
    }
  }
  return mismatches;
}

function compareVcpmConfig(
  domain: string,
  path: string,
  a: VcpmConfigProperty | undefined,
  b: VcpmConfigProperty | undefined,
): AcdbComparisonMismatch[] {
  if (!a && !b) return [];
  if (!a || !b) {
    return [{domain, detail: `${path}.vcpmConfig present in only one file`}];
  }
  if (!bytesEqual(a.getRawData(), b.getRawData())) {
    return [{domain, detail: `${path}.vcpmConfig payload differs`}];
  }
  return [];
}

function compareSpfProperties(
  domain: string,
  path: string,
  a: SpfProperties,
  b: SpfProperties,
): AcdbComparisonMismatch[] {
  return [
    ...compareSubgraphConfig(domain, path, a.subgraphConfig, b.subgraphConfig),
    ...compareContainerConfig(
      domain,
      path,
      a.containerConfig,
      b.containerConfig,
    ),
    ...compareModuleList(domain, path, a.moduleList, b.moduleList),
    ...compareModuleProperties(
      domain,
      path,
      a.moduleProperties,
      b.moduleProperties,
    ),
    ...compareDataLinks(domain, path, a.dataLinks, b.dataLinks),
    ...compareControlLinks(domain, path, a.controlLinks, b.controlLinks),
    ...compareVcpmConfig(domain, path, a.vcpmConfig, b.vcpmConfig),
  ];
}

function compareSubgraphData(
  a: ParsedAcdb,
  b: ParsedAcdb,
): AcdbComparisonMismatch[] {
  const domain = 'subgraphData';
  const chunkA = a.getChunk<SubgraphDataChunk>(
    PARSED_CHUNK_TYPES.SUBGRAPH_DATA,
  );
  const chunkB = b.getChunk<SubgraphDataChunk>(
    PARSED_CHUNK_TYPES.SUBGRAPH_DATA,
  );
  if (!chunkA && !chunkB) return [];
  if (!chunkA || !chunkB) {
    return [{domain, detail: 'derived subgraph data present in only one file'}];
  }

  const mismatches: AcdbComparisonMismatch[] = [];
  const diff = diffByKey(chunkA.subgraphData, chunkB.subgraphData, entry =>
    String(entry.subgraphId),
  );
  for (const entry of diff.onlyInA) {
    mismatches.push({
      domain,
      detail: `subgraph[${entry.subgraphId}] present only in original file`,
    });
  }
  for (const entry of diff.onlyInB) {
    mismatches.push({
      domain,
      detail: `subgraph[${entry.subgraphId}] present only in downloaded file`,
    });
  }

  for (const [entryA, entryB] of diff.pairs) {
    const path = `subgraph[${entryA.subgraphId}]`;

    const {subgraphId: driverSgIdA, properties: driverPropsA} =
      parseDriverProperties(entryA.driverProperties);
    const {subgraphId: driverSgIdB, properties: driverPropsB} =
      parseDriverProperties(entryB.driverProperties);
    if (driverSgIdA !== driverSgIdB) {
      mismatches.push({
        domain,
        detail: `${path}.driverProperties: embedded subgraphId differs (original=${driverSgIdA}, downloaded=${driverSgIdB})`,
      });
    }
    mismatches.push(
      ...compareByteMaps(
        domain,
        `${path}.driverProperties`,
        driverPropsA,
        driverPropsB,
      ),
      ...compareSpfProperties(
        domain,
        path,
        entryA.spfProperties,
        entryB.spfProperties,
      ),
    );
  }

  return mismatches;
}

// ── Audio calibration ───────────────────────────────────────────────────

function compareAudioCkvEntry(
  domain: string,
  valuePath: string,
  ckvA: {offsetCalDefinition: number; offsetCalDataOffset: number},
  ckvB: {offsetCalDefinition: number; offsetCalDataOffset: number},
  datapoolA: DatapoolChunk,
  datapoolB: DatapoolChunk,
  chunkA: AudioCalibrationChunk,
  chunkB: AudioCalibrationChunk,
): AcdbComparisonMismatch[] {
  const mismatches: AcdbComparisonMismatch[] = [];

  const defA = chunkA.getCalDefinitionEntry(ckvA.offsetCalDefinition);
  const defB = chunkB.getCalDefinitionEntry(ckvB.offsetCalDefinition);
  if (!defA || !defB) {
    mismatches.push({
      domain,
      detail: `${valuePath}: definition entry missing on one side`,
    });
  } else {
    const idsA = defA.calIdEntries.map(
      e => `${e.moduleInstanceId}:${e.paramId}`,
    );
    const idsB = defB.calIdEntries.map(
      e => `${e.moduleInstanceId}:${e.paramId}`,
    );
    if (idsA.join('|') !== idsB.join('|')) {
      mismatches.push({
        domain,
        detail: `${valuePath}: module/parameter list differs (original=[${idsA.join(', ')}], downloaded=[${idsB.join(', ')}])`,
      });
    }
  }

  const dotA = chunkA.getCalDataOffsetEntry(ckvA.offsetCalDataOffset);
  const dotB = chunkB.getCalDataOffsetEntry(ckvB.offsetCalDataOffset);
  if (!dotA || !dotB) {
    mismatches.push({
      domain,
      detail: `${valuePath}: data offset entry missing on one side`,
    });
    return mismatches;
  }
  if (dotA.calDataOffsets.length !== dotB.calDataOffsets.length) {
    mismatches.push({
      domain,
      detail: `${valuePath}: payload count differs (original=${dotA.calDataOffsets.length}, downloaded=${dotB.calDataOffsets.length})`,
    });
    return mismatches;
  }
  for (let i = 0; i < dotA.calDataOffsets.length; i++) {
    const payloadA = datapoolA.getDataAtOffset(dotA.calDataOffsets[i]);
    const payloadB = datapoolB.getDataAtOffset(dotB.calDataOffsets[i]);
    if (!bytesEqual(payloadA, payloadB)) {
      mismatches.push({
        domain,
        detail: `${valuePath}.param[${i}]: payload bytes differ`,
      });
    }
  }
  return mismatches;
}

function compareAudioKeyEntry(
  domain: string,
  keyPath: string,
  keyA: {entry: {offsetCalLookupTable: number}; keyIds: number[]},
  keyB: {entry: {offsetCalLookupTable: number}; keyIds: number[]},
  datapoolA: DatapoolChunk,
  datapoolB: DatapoolChunk,
  chunkA: AudioCalibrationChunk,
  chunkB: AudioCalibrationChunk,
): AcdbComparisonMismatch[] {
  const mismatches: AcdbComparisonMismatch[] = [];
  const ckvLutA = chunkA.getCkvLookupTable(keyA.entry.offsetCalLookupTable);
  const ckvLutB = chunkB.getCkvLookupTable(keyB.entry.offsetCalLookupTable);
  if (!ckvLutA || !ckvLutB) {
    return [
      {domain, detail: `${keyPath}: CKV lookup table missing on one side`},
    ];
  }

  const ckvDiff = diffByKey(
    ckvLutA.ckvLookupEntries,
    ckvLutB.ckvLookupEntries,
    e => e.calKeyValues.join(','),
  );
  for (const e of ckvDiff.onlyInA) {
    mismatches.push({
      domain,
      detail: `${keyPath}.valueCombo[${e.calKeyValues.join(',')}] present only in original file`,
    });
  }
  for (const e of ckvDiff.onlyInB) {
    mismatches.push({
      domain,
      detail: `${keyPath}.valueCombo[${e.calKeyValues.join(',')}] present only in downloaded file`,
    });
  }
  for (const [ckvA, ckvB] of ckvDiff.pairs) {
    const valuePath = `${keyPath}.valueCombo[${ckvA.calKeyValues.join(',')}]`;
    mismatches.push(
      ...compareAudioCkvEntry(
        domain,
        valuePath,
        ckvA,
        ckvB,
        datapoolA,
        datapoolB,
        chunkA,
        chunkB,
      ),
    );
  }
  return mismatches;
}

function compareAudioCalibration(
  a: ParsedAcdb,
  b: ParsedAcdb,
): AcdbComparisonMismatch[] {
  const domain = 'audioCalibration';
  const chunkA = a.getChunk<AudioCalibrationChunk>(
    PARSED_CHUNK_TYPES.AUDIO_CALIBRATION_DATA,
  );
  const chunkB = b.getChunk<AudioCalibrationChunk>(
    PARSED_CHUNK_TYPES.AUDIO_CALIBRATION_DATA,
  );
  if (!chunkA && !chunkB) return [];
  if (!chunkA || !chunkB) {
    return [
      {domain, detail: 'CALIBRATION_SUBGRAPH_LUT present in only one file'},
    ];
  }

  const datapoolA = a.getChunk<DatapoolChunk>(PARSED_CHUNK_TYPES.DATAPOOL);
  const datapoolB = b.getChunk<DatapoolChunk>(PARSED_CHUNK_TYPES.DATAPOOL);
  if (!datapoolA || !datapoolB) {
    return [
      {
        domain,
        detail: 'DATAPOOL missing while audio calibration data is present',
      },
    ];
  }

  const mismatches: AcdbComparisonMismatch[] = [];
  const sgDiff = diffByKey(
    chunkA.subgraphLookupEntries,
    chunkB.subgraphLookupEntries,
    sg => String(sg.subgraphId),
  );
  for (const sg of sgDiff.onlyInA) {
    mismatches.push({
      domain,
      detail: `subgraph[${sg.subgraphId}] present only in original file`,
    });
  }
  for (const sg of sgDiff.onlyInB) {
    mismatches.push({
      domain,
      detail: `subgraph[${sg.subgraphId}] present only in downloaded file`,
    });
  }

  for (const [sgA, sgB] of sgDiff.pairs) {
    const path = `subgraph[${sgA.subgraphId}]`;

    const keyEntriesA = sgA.calKeyTableEntries.map(entry => ({
      entry,
      keyIds: chunkA.getCalKeyTable(entry.offsetCalKeyTable) ?? [],
    }));
    const keyEntriesB = sgB.calKeyTableEntries.map(entry => ({
      entry,
      keyIds: chunkB.getCalKeyTable(entry.offsetCalKeyTable) ?? [],
    }));
    const keyDiff = diffByKey(keyEntriesA, keyEntriesB, x =>
      x.keyIds.join(','),
    );
    for (const x of keyDiff.onlyInA) {
      mismatches.push({
        domain,
        detail: `${path}.keyCombo[${x.keyIds.join(',')}] present only in original file`,
      });
    }
    for (const x of keyDiff.onlyInB) {
      mismatches.push({
        domain,
        detail: `${path}.keyCombo[${x.keyIds.join(',')}] present only in downloaded file`,
      });
    }

    for (const [keyA, keyB] of keyDiff.pairs) {
      const keyPath = `${path}.keyCombo[${keyA.keyIds.join(',')}]`;
      mismatches.push(
        ...compareAudioKeyEntry(
          domain,
          keyPath,
          keyA,
          keyB,
          datapoolA,
          datapoolB,
          chunkA,
          chunkB,
        ),
      );
    }
  }

  return mismatches;
}

// ── Voice calibration ───────────────────────────────────────────────────

function compareVoiceCalObj(
  domain: string,
  valuePath: string,
  objA: {
    obj: {
      offsetVoiceCalDefinitionTable: number;
      offsetsInGlobalDataPool: number[];
    };
    calKeyValues: number[];
  },
  objB: {
    obj: {
      offsetVoiceCalDefinitionTable: number;
      offsetsInGlobalDataPool: number[];
    };
    calKeyValues: number[];
  },
  datapoolA: DatapoolChunk,
  datapoolB: DatapoolChunk,
  chunkA: VoiceCalibrationChunk,
  chunkB: VoiceCalibrationChunk,
): AcdbComparisonMismatch[] {
  const mismatches: AcdbComparisonMismatch[] = [];

  const defA = chunkA.getCalDefinitionEntry(
    objA.obj.offsetVoiceCalDefinitionTable,
  );
  const defB = chunkB.getCalDefinitionEntry(
    objB.obj.offsetVoiceCalDefinitionTable,
  );
  const pairsA = (defA?.moduleInstanceParamPairs ?? []).map(
    p => `${p.moduleInstanceId}:${p.paramId}`,
  );
  const pairsB = (defB?.moduleInstanceParamPairs ?? []).map(
    p => `${p.moduleInstanceId}:${p.paramId}`,
  );
  if (pairsA.join('|') !== pairsB.join('|')) {
    mismatches.push({
      domain,
      detail: `${valuePath}: module/parameter list differs (original=[${pairsA.join(', ')}], downloaded=[${pairsB.join(', ')}])`,
    });
  }

  const offsetsA = objA.obj.offsetsInGlobalDataPool;
  const offsetsB = objB.obj.offsetsInGlobalDataPool;
  if (offsetsA.length !== offsetsB.length) {
    mismatches.push({
      domain,
      detail: `${valuePath}: payload count differs (original=${offsetsA.length}, downloaded=${offsetsB.length})`,
    });
    return mismatches;
  }
  for (const [i, element] of offsetsA.entries()) {
    const payloadA = datapoolA.getDataAtOffset(element);
    const payloadB = datapoolB.getDataAtOffset(offsetsB[i]);
    if (!bytesEqual(payloadA, payloadB)) {
      mismatches.push({
        domain,
        detail: `${valuePath}.param[${i}]: payload bytes differ`,
      });
    }
  }
  return mismatches;
}

function compareVoiceTableEntry(
  domain: string,
  keyPath: string,
  tableA: {
    table: {
      calDataObjects: {
        offsetVoiceCkvLookupTable: number;
        offsetVoiceCalDefinitionTable: number;
        offsetsInGlobalDataPool: number[];
      }[];
    };
    keyIds: number[];
  },
  tableB: {
    table: {
      calDataObjects: {
        offsetVoiceCkvLookupTable: number;
        offsetVoiceCalDefinitionTable: number;
        offsetsInGlobalDataPool: number[];
      }[];
    };
    keyIds: number[];
  },
  datapoolA: DatapoolChunk,
  datapoolB: DatapoolChunk,
  chunkA: VoiceCalibrationChunk,
  chunkB: VoiceCalibrationChunk,
): AcdbComparisonMismatch[] {
  const mismatches: AcdbComparisonMismatch[] = [];

  const objsA = tableA.table.calDataObjects.map(obj => ({
    obj,
    calKeyValues:
      chunkA.getCkvLookupTable(obj.offsetVoiceCkvLookupTable)
        ?.voiceCkvLookupEntries[0]?.voiceCalKeyValues ?? [],
  }));
  const objsB = tableB.table.calDataObjects.map(obj => ({
    obj,
    calKeyValues:
      chunkB.getCkvLookupTable(obj.offsetVoiceCkvLookupTable)
        ?.voiceCkvLookupEntries[0]?.voiceCalKeyValues ?? [],
  }));
  const objDiff = diffByKey(objsA, objsB, x => x.calKeyValues.join(','));
  for (const x of objDiff.onlyInA) {
    mismatches.push({
      domain,
      detail: `${keyPath}.valueCombo[${x.calKeyValues.join(',')}] present only in original file`,
    });
  }
  for (const x of objDiff.onlyInB) {
    mismatches.push({
      domain,
      detail: `${keyPath}.valueCombo[${x.calKeyValues.join(',')}] present only in downloaded file`,
    });
  }
  for (const [objA, objB] of objDiff.pairs) {
    const valuePath = `${keyPath}.valueCombo[${objA.calKeyValues.join(',')}]`;
    mismatches.push(
      ...compareVoiceCalObj(
        domain,
        valuePath,
        objA,
        objB,
        datapoolA,
        datapoolB,
        chunkA,
        chunkB,
      ),
    );
  }
  return mismatches;
}

function compareVoiceSubgraphEntry(
  domain: string,
  sgA: {
    subgraphId: number;
    offsetVoiceMasterKeyTable: number;
    voiceCkvDataTables: {
      offsetVoiceCalKeyTable: number;
      calDataObjects: {
        offsetVoiceCkvLookupTable: number;
        offsetVoiceCalDefinitionTable: number;
        offsetsInGlobalDataPool: number[];
      }[];
    }[];
  },
  sgB: {
    subgraphId: number;
    offsetVoiceMasterKeyTable: number;
    voiceCkvDataTables: {
      offsetVoiceCalKeyTable: number;
      calDataObjects: {
        offsetVoiceCkvLookupTable: number;
        offsetVoiceCalDefinitionTable: number;
        offsetsInGlobalDataPool: number[];
      }[];
    }[];
  },
  datapoolA: DatapoolChunk,
  datapoolB: DatapoolChunk,
  chunkA: VoiceCalibrationChunk,
  chunkB: VoiceCalibrationChunk,
): AcdbComparisonMismatch[] {
  const mismatches: AcdbComparisonMismatch[] = [];
  const path = `subgraph[${sgA.subgraphId}]`;

  const masterKeyA = chunkA.getMasterKeyTable(sgA.offsetVoiceMasterKeyTable);
  const masterKeyB = chunkB.getMasterKeyTable(sgB.offsetVoiceMasterKeyTable);
  const keysA = (masterKeyA?.keyInfos ?? []).map(
    k => `${k.voiceKeyId}:${k.isDynamic}`,
  );
  const keysB = (masterKeyB?.keyInfos ?? []).map(
    k => `${k.voiceKeyId}:${k.isDynamic}`,
  );
  if (keysA.join('|') !== keysB.join('|')) {
    mismatches.push({
      domain,
      detail: `${path}.masterKeys differs (original=[${keysA.join(', ')}], downloaded=[${keysB.join(', ')}])`,
    });
  }

  const ckvTablesA = sgA.voiceCkvDataTables.map(table => ({
    table,
    keyIds:
      chunkA.getCalKeyTable(table.offsetVoiceCalKeyTable)?.voiceKeyIds ?? [],
  }));
  const ckvTablesB = sgB.voiceCkvDataTables.map(table => ({
    table,
    keyIds:
      chunkB.getCalKeyTable(table.offsetVoiceCalKeyTable)?.voiceKeyIds ?? [],
  }));
  const tableDiff = diffByKey(ckvTablesA, ckvTablesB, x => x.keyIds.join(','));
  for (const x of tableDiff.onlyInA) {
    mismatches.push({
      domain,
      detail: `${path}.keyCombo[${x.keyIds.join(',')}] present only in original file`,
    });
  }
  for (const x of tableDiff.onlyInB) {
    mismatches.push({
      domain,
      detail: `${path}.keyCombo[${x.keyIds.join(',')}] present only in downloaded file`,
    });
  }
  for (const [tableA, tableB] of tableDiff.pairs) {
    const keyPath = `${path}.keyCombo[${tableA.keyIds.join(',')}]`;
    mismatches.push(
      ...compareVoiceTableEntry(
        domain,
        keyPath,
        tableA,
        tableB,
        datapoolA,
        datapoolB,
        chunkA,
        chunkB,
      ),
    );
  }
  return mismatches;
}

function compareVoiceCalibration(
  a: ParsedAcdb,
  b: ParsedAcdb,
): AcdbComparisonMismatch[] {
  const domain = 'voiceCalibration';
  const chunkA = a.getChunk<VoiceCalibrationChunk>(
    PARSED_CHUNK_TYPES.VOICE_CALIBRATION_DATA,
  );
  const chunkB = b.getChunk<VoiceCalibrationChunk>(
    PARSED_CHUNK_TYPES.VOICE_CALIBRATION_DATA,
  );
  const hasA = !!chunkA && chunkA.subgraphCalTables.length > 0;
  const hasB = !!chunkB && chunkB.subgraphCalTables.length > 0;
  if (!hasA && !hasB) return [];
  if (!hasA || !hasB || !chunkA || !chunkB) {
    return [{domain, detail: 'VCPM_CALDATA present in only one file'}];
  }

  const datapoolA = a.getChunk<DatapoolChunk>(PARSED_CHUNK_TYPES.DATAPOOL);
  const datapoolB = b.getChunk<DatapoolChunk>(PARSED_CHUNK_TYPES.DATAPOOL);
  if (!datapoolA || !datapoolB) {
    return [
      {
        domain,
        detail: 'DATAPOOL missing while voice calibration data is present',
      },
    ];
  }

  const mismatches: AcdbComparisonMismatch[] = [];
  const sgDiff = diffByKey(
    chunkA.subgraphCalTables,
    chunkB.subgraphCalTables,
    sg => String(sg.subgraphId),
  );
  for (const sg of sgDiff.onlyInA) {
    mismatches.push({
      domain,
      detail: `subgraph[${sg.subgraphId}] present only in original file`,
    });
  }
  for (const sg of sgDiff.onlyInB) {
    mismatches.push({
      domain,
      detail: `subgraph[${sg.subgraphId}] present only in downloaded file`,
    });
  }

  for (const [sgA, sgB] of sgDiff.pairs) {
    mismatches.push(
      ...compareVoiceSubgraphEntry(
        domain,
        sgA,
        sgB,
        datapoolA,
        datapoolB,
        chunkA,
        chunkB,
      ),
    );
  }

  return mismatches;
}

// ── Driver calibration ──────────────────────────────────────────────────

function compareDriverCkvEntry(
  domain: string,
  valuePath: string,
  ckvA: {
    offsetCalDefinition: number;
    offsetCalDataOffset: number;
    calKeyValues: number[];
  },
  ckvB: {
    offsetCalDefinition: number;
    offsetCalDataOffset: number;
    calKeyValues: number[];
  },
  datapoolA: DatapoolChunk,
  datapoolB: DatapoolChunk,
  chunkA: DriverCalibrationChunk,
  chunkB: DriverCalibrationChunk,
): AcdbComparisonMismatch[] {
  const mismatches: AcdbComparisonMismatch[] = [];

  const defA = chunkA.getCalDefinitionEntry(ckvA.offsetCalDefinition);
  const defB = chunkB.getCalDefinitionEntry(ckvB.offsetCalDefinition);
  const paramsA = (defA?.calIdEntries ?? []).map(e => e.paramId);
  const paramsB = (defB?.calIdEntries ?? []).map(e => e.paramId);
  if (compareNumberArrays(paramsA, paramsB) !== 0) {
    mismatches.push({
      domain,
      detail: `${valuePath}: parameter list differs (original=[${paramsA.join(', ')}], downloaded=[${paramsB.join(', ')}])`,
    });
  }

  const dotA = chunkA.getCalDataOffsetEntry(ckvA.offsetCalDataOffset);
  const dotB = chunkB.getCalDataOffsetEntry(ckvB.offsetCalDataOffset);
  const offsetsA = dotA?.calDataOffsets ?? [];
  const offsetsB = dotB?.calDataOffsets ?? [];
  if (offsetsA.length !== offsetsB.length) {
    mismatches.push({
      domain,
      detail: `${valuePath}: payload count differs (original=${offsetsA.length}, downloaded=${offsetsB.length})`,
    });
    return mismatches;
  }
  for (const [i, element] of offsetsA.entries()) {
    const payloadA = datapoolA.getDataAtOffset(element);
    const payloadB = datapoolB.getDataAtOffset(offsetsB[i]);
    if (!bytesEqual(payloadA, payloadB)) {
      mismatches.push({
        domain,
        detail: `${valuePath}.param[${i}]: payload bytes differ`,
      });
    }
  }
  return mismatches;
}

function compareDriverKeyEntry(
  domain: string,
  keyPath: string,
  keyA: {entry: {offsetCalLookupTable: number}; keyIds: number[]},
  keyB: {entry: {offsetCalLookupTable: number}; keyIds: number[]},
  datapoolA: DatapoolChunk,
  datapoolB: DatapoolChunk,
  chunkA: DriverCalibrationChunk,
  chunkB: DriverCalibrationChunk,
): AcdbComparisonMismatch[] {
  const mismatches: AcdbComparisonMismatch[] = [];
  const ckvLutA = chunkA.getCkvLookupTable(keyA.entry.offsetCalLookupTable);
  const ckvLutB = chunkB.getCkvLookupTable(keyB.entry.offsetCalLookupTable);
  if (!ckvLutA || !ckvLutB) {
    return [
      {domain, detail: `${keyPath}: CKV lookup table missing on one side`},
    ];
  }

  const ckvDiff = diffByKey(
    ckvLutA.ckvLookupEntries,
    ckvLutB.ckvLookupEntries,
    e => e.calKeyValues.join(','),
  );
  for (const e of ckvDiff.onlyInA) {
    mismatches.push({
      domain,
      detail: `${keyPath}.valueCombo[${e.calKeyValues.join(',')}] present only in original file`,
    });
  }
  for (const e of ckvDiff.onlyInB) {
    mismatches.push({
      domain,
      detail: `${keyPath}.valueCombo[${e.calKeyValues.join(',')}] present only in downloaded file`,
    });
  }
  for (const [ckvA, ckvB] of ckvDiff.pairs) {
    const valuePath = `${keyPath}.valueCombo[${ckvA.calKeyValues.join(',')}]`;
    mismatches.push(
      ...compareDriverCkvEntry(
        domain,
        valuePath,
        ckvA,
        ckvB,
        datapoolA,
        datapoolB,
        chunkA,
        chunkB,
      ),
    );
  }
  return mismatches;
}

function compareDriverCalibration(
  a: ParsedAcdb,
  b: ParsedAcdb,
): AcdbComparisonMismatch[] {
  const domain = 'driverCalibration';
  const chunkA = a.getChunk<DriverCalibrationChunk>(
    PARSED_CHUNK_TYPES.DRIVER_CALIBRATION_DATA,
  );
  const chunkB = b.getChunk<DriverCalibrationChunk>(
    PARSED_CHUNK_TYPES.DRIVER_CALIBRATION_DATA,
  );
  const hasA = !!chunkA && chunkA.moduleLookupEntries.length > 0;
  const hasB = !!chunkB && chunkB.moduleLookupEntries.length > 0;
  if (!hasA && !hasB) return [];
  if (!hasA || !hasB || !chunkA || !chunkB) {
    return [
      {domain, detail: 'DRIVER_CALIBRATION_LUT present in only one file'},
    ];
  }

  const datapoolA = a.getChunk<DatapoolChunk>(PARSED_CHUNK_TYPES.DATAPOOL);
  const datapoolB = b.getChunk<DatapoolChunk>(PARSED_CHUNK_TYPES.DATAPOOL);
  if (!datapoolA || !datapoolB) {
    return [
      {
        domain,
        detail: 'DATAPOOL missing while driver calibration data is present',
      },
    ];
  }

  const mismatches: AcdbComparisonMismatch[] = [];
  const moduleDiff = diffByKey(
    chunkA.moduleLookupEntries,
    chunkB.moduleLookupEntries,
    m => String(m.moduleDefinitionId),
  );
  for (const m of moduleDiff.onlyInA) {
    mismatches.push({
      domain,
      detail: `module[${BinaryUtils.toHexString(m.moduleDefinitionId)}] present only in original file`,
    });
  }
  for (const m of moduleDiff.onlyInB) {
    mismatches.push({
      domain,
      detail: `module[${BinaryUtils.toHexString(m.moduleDefinitionId)}] present only in downloaded file`,
    });
  }

  for (const [moduleA, moduleB] of moduleDiff.pairs) {
    const path = `module[${BinaryUtils.toHexString(moduleA.moduleDefinitionId)}]`;

    const keyEntriesA = moduleA.calKeyTableEntries.map(entry => ({
      entry,
      keyIds: chunkA.getCalKeyTable(entry.offsetCalKeyTable) ?? [],
    }));
    const keyEntriesB = moduleB.calKeyTableEntries.map(entry => ({
      entry,
      keyIds: chunkB.getCalKeyTable(entry.offsetCalKeyTable) ?? [],
    }));
    const keyDiff = diffByKey(keyEntriesA, keyEntriesB, x =>
      x.keyIds.join(','),
    );
    for (const x of keyDiff.onlyInA) {
      mismatches.push({
        domain,
        detail: `${path}.keyCombo[${x.keyIds.join(',')}] present only in original file`,
      });
    }
    for (const x of keyDiff.onlyInB) {
      mismatches.push({
        domain,
        detail: `${path}.keyCombo[${x.keyIds.join(',')}] present only in downloaded file`,
      });
    }

    for (const [keyA, keyB] of keyDiff.pairs) {
      const keyPath = `${path}.keyCombo[${keyA.keyIds.join(',')}]`;
      mismatches.push(
        ...compareDriverKeyEntry(
          domain,
          keyPath,
          keyA,
          keyB,
          datapoolA,
          datapoolB,
          chunkA,
          chunkB,
        ),
      );
    }
  }

  return mismatches;
}

// ── Tag data ─────────────────────────────────────────────────────────────

function compareTagVectorEntry(
  domain: string,
  vecPath: string,
  vecA: {
    tagKeyValues: number[];
    offsetTagDataDEF: number;
    offsetTagDataDOT: number;
  },
  vecB: {
    tagKeyValues: number[];
    offsetTagDataDEF: number;
    offsetTagDataDOT: number;
  },
  datapoolA: DatapoolChunk,
  datapoolB: DatapoolChunk,
  chunkA: TagDataChunk,
  chunkB: TagDataChunk,
): AcdbComparisonMismatch[] {
  const mismatches: AcdbComparisonMismatch[] = [];

  const defA = chunkA.getTagDataDefEntry(vecA.offsetTagDataDEF);
  const defB = chunkB.getTagDataDefEntry(vecB.offsetTagDataDEF);
  const dotA = chunkA.getTagDataDotEntry(vecA.offsetTagDataDOT);
  const dotB = chunkB.getTagDataDotEntry(vecB.offsetTagDataDOT);

  const idEntriesA = defA?.taggedIdEntries ?? [];
  const idEntriesB = defB?.taggedIdEntries ?? [];
  const offsetsA = dotA?.taggedDataOffsets ?? [];
  const offsetsB = dotB?.taggedDataOffsets ?? [];

  if (idEntriesA.length !== idEntriesB.length) {
    mismatches.push({
      domain,
      detail: `${vecPath}: module/parameter count differs (original=${idEntriesA.length}, downloaded=${idEntriesB.length})`,
    });
    return mismatches;
  }
  for (const [i, ea] of idEntriesA.entries()) {
    const eb = idEntriesB[i];
    if (
      ea.moduleInstanceId !== eb.moduleInstanceId ||
      ea.paramId !== eb.paramId
    ) {
      mismatches.push({
        domain,
        detail: `${vecPath}.param[${i}]: (moduleInstanceId,paramId) differs (original=${ea.moduleInstanceId}:${ea.paramId}, downloaded=${eb.moduleInstanceId}:${eb.paramId})`,
      });
    }
    const payloadA = datapoolA.getDataAtOffset(offsetsA[i]);
    const payloadB = datapoolB.getDataAtOffset(offsetsB[i]);
    if (!bytesEqual(payloadA, payloadB)) {
      mismatches.push({
        domain,
        detail: `${vecPath}.param[${i}]: payload bytes differ`,
      });
    }
  }
  return mismatches;
}

function compareTagEntry(
  domain: string,
  entryA: {subgraphId: number; tagId: number; offsetTagDataTable: number},
  entryB: {subgraphId: number; tagId: number; offsetTagDataTable: number},
  datapoolA: DatapoolChunk,
  datapoolB: DatapoolChunk,
  chunkA: TagDataChunk,
  chunkB: TagDataChunk,
): AcdbComparisonMismatch[] {
  const mismatches: AcdbComparisonMismatch[] = [];
  const path = `tag[sg=${entryA.subgraphId},tag=${BinaryUtils.toHexString(entryA.tagId)}]`;

  const tableA = chunkA.getTagLutDataTable(entryA.offsetTagDataTable);
  const tableB = chunkB.getTagLutDataTable(entryB.offsetTagDataTable);
  if (!tableA || !tableB) {
    return [{domain, detail: `${path}: tag LUT table missing on one side`}];
  }

  const vectorDiff = diffByKey(
    tableA.tagKeyVectorEntries,
    tableB.tagKeyVectorEntries,
    v => v.tagKeyValues.join(','),
  );
  for (const v of vectorDiff.onlyInA) {
    mismatches.push({
      domain,
      detail: `${path}.valueVector[${v.tagKeyValues.join(',')}] present only in original file`,
    });
  }
  for (const v of vectorDiff.onlyInB) {
    mismatches.push({
      domain,
      detail: `${path}.valueVector[${v.tagKeyValues.join(',')}] present only in downloaded file`,
    });
  }
  for (const [vecA, vecB] of vectorDiff.pairs) {
    const vecPath = `${path}.valueVector[${vecA.tagKeyValues.join(',')}]`;
    mismatches.push(
      ...compareTagVectorEntry(
        domain,
        vecPath,
        vecA,
        vecB,
        datapoolA,
        datapoolB,
        chunkA,
        chunkB,
      ),
    );
  }
  return mismatches;
}

function compareTagData(
  a: ParsedAcdb,
  b: ParsedAcdb,
): AcdbComparisonMismatch[] {
  const domain = 'tagData';
  const chunkA = a.getChunk<TagDataChunk>(PARSED_CHUNK_TYPES.TAG_DATA);
  const chunkB = b.getChunk<TagDataChunk>(PARSED_CHUNK_TYPES.TAG_DATA);
  const hasA = !!chunkA && chunkA.tagIndexEntries.length > 0;
  const hasB = !!chunkB && chunkB.tagIndexEntries.length > 0;
  if (!hasA && !hasB) return [];
  if (!hasA || !hasB || !chunkA || !chunkB) {
    return [{domain, detail: 'MODULE_TAG_KEY_TABLE present in only one file'}];
  }

  const datapoolA = a.getChunk<DatapoolChunk>(PARSED_CHUNK_TYPES.DATAPOOL);
  const datapoolB = b.getChunk<DatapoolChunk>(PARSED_CHUNK_TYPES.DATAPOOL);
  if (!datapoolA || !datapoolB) {
    return [{domain, detail: 'DATAPOOL missing while tag data is present'}];
  }

  const mismatches: AcdbComparisonMismatch[] = [];
  const indexDiff = diffByKey(
    chunkA.tagIndexEntries,
    chunkB.tagIndexEntries,
    e => `${e.subgraphId}:${e.tagId}`,
  );
  for (const e of indexDiff.onlyInA) {
    mismatches.push({
      domain,
      detail: `tag[sg=${e.subgraphId},tag=${BinaryUtils.toHexString(e.tagId)}] present only in original file`,
    });
  }
  for (const e of indexDiff.onlyInB) {
    mismatches.push({
      domain,
      detail: `tag[sg=${e.subgraphId},tag=${BinaryUtils.toHexString(e.tagId)}] present only in downloaded file`,
    });
  }

  for (const [entryA, entryB] of indexDiff.pairs) {
    mismatches.push(
      ...compareTagEntry(
        domain,
        entryA,
        entryB,
        datapoolA,
        datapoolB,
        chunkA,
        chunkB,
      ),
    );
  }

  return mismatches;
}

// ── Tagged module map ───────────────────────────────────────────────────

function compareTaggedModuleMap(
  a: ParsedAcdb,
  b: ParsedAcdb,
): AcdbComparisonMismatch[] {
  const domain = 'taggedModuleMap';
  const chunkA = a.getChunk<TaggedModuleMapChunk>(
    PARSED_CHUNK_TYPES.TAGGED_MODULE_MAP,
  );
  const chunkB = b.getChunk<TaggedModuleMapChunk>(
    PARSED_CHUNK_TYPES.TAGGED_MODULE_MAP,
  );
  const hasA = !!chunkA && chunkA.taggedModuleEntries.length > 0;
  const hasB = !!chunkB && chunkB.taggedModuleEntries.length > 0;
  if (!hasA && !hasB) return [];
  if (!hasA || !hasB || !chunkA || !chunkB) {
    return [{domain, detail: 'TAGGED_MODULES_LUT present in only one file'}];
  }

  const mismatches: AcdbComparisonMismatch[] = [];
  const entryDiff = diffByKey(
    chunkA.taggedModuleEntries,
    chunkB.taggedModuleEntries,
    e => `${e.subgraphId}:${e.tagId}`,
  );
  for (const e of entryDiff.onlyInA) {
    mismatches.push({
      domain,
      detail: `tag[sg=${e.subgraphId},tag=${BinaryUtils.toHexString(e.tagId)}] present only in original file`,
    });
  }
  for (const e of entryDiff.onlyInB) {
    mismatches.push({
      domain,
      detail: `tag[sg=${e.subgraphId},tag=${BinaryUtils.toHexString(e.tagId)}] present only in downloaded file`,
    });
  }

  for (const [entryA, entryB] of entryDiff.pairs) {
    const path = `tag[sg=${entryA.subgraphId},tag=${BinaryUtils.toHexString(entryA.tagId)}]`;

    const defA = chunkA.getTaggedModuleDef(entryA.offsetTaggedModuleDef);
    const defB = chunkB.getTaggedModuleDef(entryB.offsetTaggedModuleDef);
    const pairsDiff = diffByKey(
      defA?.moduleInstancePairs ?? [],
      defB?.moduleInstancePairs ?? [],
      p => `${p.moduleId}:${p.instanceId}`,
    );
    for (const p of pairsDiff.onlyInA) {
      mismatches.push({
        domain,
        detail: `${path}.module[${p.moduleId}:${p.instanceId}] present only in original file`,
      });
    }
    for (const p of pairsDiff.onlyInB) {
      mismatches.push({
        domain,
        detail: `${path}.module[${p.moduleId}:${p.instanceId}] present only in downloaded file`,
      });
    }
  }

  return mismatches;
}

// ── Known gaps (chunk types the download pipeline doesn't serialize) ────

const UNSUPPORTED_DOWNLOAD_DOMAINS: Array<{
  parsedType: ParsedChunkType;
  label: string;
}> = [
  {
    parsedType: PARSED_CHUNK_TYPES.SUBGRAPH_PAIR_DATA,
    label: 'SUBGRAPH_PAIR_DATA (SCLU/SCDE/SCDO)',
  },
  {
    parsedType: PARSED_CHUNK_TYPES.MODULE_MANAGER,
    label: 'MODULE_MANAGER (MODM)',
  },
  {
    parsedType: PARSED_CHUNK_TYPES.BOOTUP_LOADING,
    label: 'BOOTUP_LOADING (BTUP)',
  },
  {
    parsedType: PARSED_CHUNK_TYPES.GKV_ALIAS_DATA,
    label: 'GKV_ALIAS_DATA (GALS)',
  },
];

/**
 * NOTE: MODULE_TAG_KEYIDS_TABLE (MTKL) is intentionally not checked here — it
 * has no registered upload-side parser at all (see chunk-metadata-registry.ts),
 * so it never appears in a ParsedAcdb regardless of which file is parsed.
 */
function collectUnsupportedDomainNotes(a: ParsedAcdb, b: ParsedAcdb): string[] {
  const notes: string[] = [];
  for (const {parsedType, label} of UNSUPPORTED_DOWNLOAD_DOMAINS) {
    const hasA = a.hasChunk(parsedType);
    const hasB = b.hasChunk(parsedType);
    if (hasA !== hasB) {
      notes.push(
        `${label} present in ${hasA ? 'original' : 'downloaded'} file only — ` +
          'the download pipeline does not currently serialize this chunk type, ' +
          'so this is a known gap, not a round-trip regression.',
      );
    }
  }
  return notes;
}
