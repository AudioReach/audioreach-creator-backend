/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  ACDBVersionInfo,
  CodecInfo,
} from '../../../../file-operations/shared/acdb-chunks/header-chunk.js';

/**
 * ACDB project header metadata from database.
 */
export interface ProjectHeaderMetadata {
  version: ACDBVersionInfo;
  codecInfos: CodecInfo[];
  modifiedDate: number;
  oemInfo: string;
}

/**
 * Subgraph property data for file download.
 * Flattened structure optimized for ACDB binary serialization.
 */
export interface SubgraphPropertyDownloadModel {
  /** Property natural ID */
  propertyId: number;
  /** Binary property payload */
  payload: Uint8Array;
}

/**
 * Container property data for file download.
 * Flattened structure optimized for ACDB binary serialization.
 */
export interface ContainerPropertyDownloadModel {
  /** Property natural ID */
  propertyId: number;
  /** Binary property payload */
  payload: Uint8Array;
}

/**
 * Complete container data for file download.
 * Flattened structure optimized for ACDB binary serialization.
 */
export interface ContainerDownloadModel {
  /** Container natural ID */
  containerId: number;
  /** Container properties */
  properties: ContainerPropertyDownloadModel[];
}

/**
 * Module instance data for file download.
 */
export interface ModuleDownloadModel {
  /** Module instance natural ID */
  instanceId: number;
  /** Module definition natural ID */
  moduleId: number;
  /** Container natural ID */
  containerId: number;
  /** Maximum input ports */
  maxInputPorts: number;
  /** Maximum output ports */
  maxOutputPorts: number;
  /** Module properties (heap IDs, etc.) */
  properties: Array<{propertyId: number; payload: Uint8Array}>;
}

/**
 * Data link for file download.
 */
export interface DataLinkDownloadModel {
  /** Source module instance ID */
  sourceInstanceId: number;
  /** Source port ID */
  sourcePortId: number;
  /** Destination module instance ID */
  destinationInstanceId: number;
  /** Destination port ID */
  destinationPortId: number;
  /** Whether link crosses subgraph boundaries */
  isInterGraph: boolean;
}

/**
 * Control link for file download.
 */
export interface ControlLinkDownloadModel {
  /** First peer module instance ID */
  peer1InstanceId: number;
  /** First peer port ID */
  peer1PortId: number;
  /** Second peer module instance ID */
  peer2InstanceId: number;
  /** Second peer port ID */
  peer2PortId: number;
  /** Whether link crosses subgraph boundaries */
  isInterGraph: boolean;
  /** Heap ID for control link */
  heapId?: number;
  /** Intent IDs for control link */
  intentIds: number[];
}

/**
 * Voice tag mapping for file download.
 */
export interface VoiceTagDownloadModel {
  /** Tag natural ID */
  tagId: number;
  /** Module instance natural ID */
  moduleInstanceId: number;
}

/**
 * Complete subgraph data for file download.
 * Flattened structure optimized for ACDB binary serialization.
 * Audio/voice classification is determined in the application layer
 * by reading properties[] with isVoiceSubgraph().
 */
export interface SubgraphDownloadModel {
  /** Subgraph natural ID */
  subgraphId: number;
  /** Subgraph properties — includes scenario ID payload used for voice detection */
  properties: SubgraphPropertyDownloadModel[];
  /** Modules in this subgraph */
  modules: ModuleDownloadModel[];
  /** Data links for this subgraph */
  dataLinks: DataLinkDownloadModel[];
  /** Control links for this subgraph */
  controlLinks: ControlLinkDownloadModel[];
  /** Voice tags (if voice subgraph) */
  voiceTags: VoiceTagDownloadModel[];
}

/**
 * Usecase data download model with natural IDs.
 * Represents a single usecase entry with its key-value pairs and subgraph data.
 * CQRS read model optimized for file download operations.
 */
export interface UsecaseDataDownloadModel {
  /** System ID (internal) */
  systemId: number;

  /** Key IDs (natural IDs from ACDB file) - sorted */
  keyIds: number[];

  /** Value IDs (natural IDs from ACDB file) - sorted */
  valueIds: number[];

  /** Subgraph IDs (natural IDs from ACDB file) */
  subgraphIds: number[];

  /** Subgraph connection pairs */
  subgraphPairs: Array<{
    sourceSubgraphId: number;
    destSubgraphId: number;
  }>;
}

/**
 * Unified calibration data per subgraph.
 * Contains both audio and voice calibration — no SQL-level filtering.
 * Application layer splits into audio/voice using SubgraphDownloadModel.properties
 * already present in DownloadEntities.
 * CQRS read model optimized for file download operations.
 */
export interface CalibrationDataDownloadModel {
  /** Subgraph natural ID */
  subgraphId: number;

  /**
   * Distinct key IDs across all CKVs in this subgraph, sorted ascending.
   * Used as master keys for voice subgraphs; ignored for audio.
   */
  masterKeys: Array<{
    keyId: number;
    isDynamic: boolean;
  }>;

  /** Key-value combinations, sorted: subgraphId → keyIds → valueIds → moduleInstanceId */
  keyValueCombinations: Array<{
    keyIds: number[];
    valueIds: number[];
    modules: Array<{
      moduleInstanceId: number;
      parameters: Array<{
        parameterId: number;
        payload: Uint8Array;
        /** Used by audio chunk builder for DOT2 grouping. Voice chunk builder ignores it. */
        pidType: string;
      }>;
    }>;
  }>;
}

/**
 * Global per-file map of tagId → sorted keyIds. Source: TagDefinition records.
 * Used to build the MTKL (MOD_TAG_KEYIDS_TABLE) chunk.
 */
export interface TagKeysDownloadModel {
  tagId: number;
  keyIds: number[]; // sorted ASC
}

/**
 * Per-(subgraphId, tagId) TKV data with module/parameter payloads.
 * Used to build MTKT, MTLU, MTDE, MTDO chunks.
 */
export interface TagDataDownloadModel {
  subgraphId: number;
  tagId: number;
  numTagKeyValues: number; // count of key slots → written as MTLU header field
  tkvs: Array<{
    tagKeyValues: number[]; // VALUE IDs sorted by keyId ASC → written into MTLU vector
    modules: Array<{
      moduleInstanceId: number;
      parameters: Array<{parameterId: number; payload: Uint8Array}>;
    }>;
  }>;
}

/**
 * Per-(subgraphId, tagId) module instances (non-voice, filtered in app layer).
 * Used to build TMLU, TMDE chunks.
 */
export interface TaggedModuleDownloadModel {
  subgraphId: number;
  tagId: number;
  isVoice: boolean; // app layer filters isVoice=true before building chunks
  moduleInstances: Array<{moduleId: number; instanceId: number}>; // sorted by [moduleId ASC, instanceId ASC]
}

/**
 * Per-(moduleDefinitionId, keyIds) group of driver calibration CKV data.
 * Used to build GCLU, GCKT, GCDT, GCDE, GCDO chunks.
 *
 * Sorting contract (must be upheld by the query layer):
 *   outer: moduleDefinitionId ASC
 *   middle: keyIds lexicographic ASC
 *   inner: valueIds lexicographic ASC
 *   params: parameterId ASC
 */
export interface DriverCalibrationDownloadModel {
  /** Natural module definition ID (MID) */
  moduleDefinitionId: number;
  /** Sorted key IDs for this group — written to GCKT */
  keyIds: number[];
  /** CKV combinations for this (MID, keySet) group */
  ckvs: Array<{
    /** VALUE IDs parallel to keyIds, sorted by keyId ASC — written to GCDT */
    valueIds: number[];
    /** Parameter payloads sorted by parameterId ASC — written to GCDE/GCDO */
    parameters: Array<{
      parameterId: number;
      payload: Uint8Array;
    }>;
  }>;
}

/**
 * All domain entities needed to reconstruct .acdb and .awsp files for a given file.
 */
export interface DownloadEntities {
  headerMetadata: ProjectHeaderMetadata;
  usecaseData?: UsecaseDataDownloadModel[];
  subgraphData?: SubgraphDownloadModel[];
  containerData?: ContainerDownloadModel[];
  calibrationData?: CalibrationDataDownloadModel[];
  tagKeys?: TagKeysDownloadModel[];
  tagData?: TagDataDownloadModel[];
  taggedModules?: TaggedModuleDownloadModel[];
  driverCalibrationData?: DriverCalibrationDownloadModel[];
}

/**
 * Query service for reading all entities needed for file download.
 * Implementations run queries in parallel for performance.
 */
export interface BulkReadQueryService {
  /**
   * Reads all entity types for a given file in parallel.
   * @param fileSystemId - The file system ID to scope the query
   */
  readAllEntitiesForFile(fileSystemId: number): Promise<DownloadEntities>;

  /**
   * Read usecase data with natural IDs, sorted for GKV chunk generation.
   *
   * Sorting order:
   * 1. Number of keys (ascending)
   * 2. Key IDs (ascending)
   * 3. Value IDs (ascending)
   *
   * @param fileSystemId - The file system ID to scope the query
   * @returns Array of usecase data sorted for GKV generation
   */
  readUsecaseData(fileSystemId: number): Promise<UsecaseDataDownloadModel[]>;

  /**
   * Read all subgraph data for file download.
   * Returns complete subgraph information including properties, modules, links, and voice tags.
   *
   * @param fileSystemId - The file system ID to scope the query
   * @returns Array of complete subgraph data
   */
  readSubgraphData(fileSystemId: number): Promise<SubgraphDownloadModel[]>;

  /**
   * Read all container data for file download.
   * Returns complete container information including properties.
   *
   * @param fileSystemId - The file system ID to scope the query
   * @returns Array of complete container data
   */
  readContainerData(fileSystemId: number): Promise<ContainerDownloadModel[]>;

  /**
   * Read all calibration data (audio + voice) with no scenario filtering.
   * Application layer determines audio/voice using isVoiceSubgraph(subgraph.properties).
   *
   * Sorting order:
   * 1. Subgraph ID (ascending)
   * 2. Key IDs (ascending)
   * 3. Value IDs (ascending)
   * 4. Module instance ID (ascending)
   * 5. Parameter ID (ascending)
   *
   * @param fileSystemId - The file system ID to scope the query
   * @returns Array of unified calibration data sorted for chunk generation
   */
  readCalibrationData(
    fileSystemId: number,
  ): Promise<CalibrationDataDownloadModel[]>;

  readTagKeys(fileSystemId: number): Promise<TagKeysDownloadModel[]>;
  readTagData(fileSystemId: number): Promise<TagDataDownloadModel[]>;
  readTaggedModuleData(
    fileSystemId: number,
  ): Promise<TaggedModuleDownloadModel[]>;
  readDriverCalibrationData(
    fileSystemId: number,
  ): Promise<DriverCalibrationDownloadModel[]>;
}
