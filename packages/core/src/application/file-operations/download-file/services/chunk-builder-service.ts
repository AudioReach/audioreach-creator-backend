/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {HeaderChunkBuilder} from './chunk-builders/header-chunk-builder.js';
import {UsecaseDataChunkBuilder} from './chunk-builders/usecase-data-chunk-builder.js';
import {AudioCalibrationChunkBuilder} from './chunk-builders/audio-calibration-chunk-builder.js';
import {
  VoiceCalibrationChunkBuilder,
  type VoiceCalibrationChunkBuildResult,
} from './chunk-builders/voice-calibration-chunk-builder.js';
import {TagKeysChunkBuilder} from './chunk-builders/tag-keys-chunk-builder.js';
import {TagDataChunkBuilder} from './chunk-builders/tag-data-chunk-builder.js';
import {TaggedModuleMapChunkBuilder} from './chunk-builders/tagged-module-map-chunk-builder.js';
import {
  DriverCalibrationChunkBuilder,
  type DriverCalibrationChunkBuildResult,
} from './chunk-builders/driver-calibration-chunk-builder.js';
import type {HeaderChunk} from '../../shared/acdb-chunks/header-chunk.js';
import type {UsecaseDataChunk} from '../../shared/acdb-chunks/usecase-data-chunk.js';
import type {AudioCalibrationChunk} from '../../shared/acdb-chunks/audio-calibration-chunk.js';
import type {TagKeysChunk} from '../../shared/acdb-chunks/tag-keys-chunk.js';
import type {TagDataChunk} from '../../shared/acdb-chunks/tag-data-chunk.js';
import type {TaggedModuleMapChunk} from '../../shared/acdb-chunks/tagged-module-map-chunk.js';
import type {DatapoolChunk} from '../../shared/acdb-chunks/datapool-chunk.js';
import type {
  ProjectHeaderMetadata,
  UsecaseDataDownloadModel,
  CalibrationDataDownloadModel,
  TagKeysDownloadModel,
  TagDataDownloadModel,
  TaggedModuleDownloadModel,
  DriverCalibrationDownloadModel,
} from '../../../ports/persistence/query-services/bulk-read/bulk-read-query-service.js';

/**
 * Service for building ACDB chunk objects from domain entities.
 * Orchestrates the chunk building process.
 *
 * This mirrors the EntityBuilderService from upload-file, but in reverse:
 * - Upload: Binary → Chunks → Entities
 * - Download: Entities → Chunks → Binary
 */
export class ChunkBuilderService {
  /**
   * Build HeaderChunk from project header metadata.
   */
  buildHeaderChunk(headerMetadata: ProjectHeaderMetadata): HeaderChunk {
    return HeaderChunkBuilder.buildChunk({headerMetadata});
  }

  /**
   * Build UsecaseDataChunk from usecase data entities.
   */
  buildUsecaseDataChunk(
    usecaseData: UsecaseDataDownloadModel[],
  ): UsecaseDataChunk {
    return UsecaseDataChunkBuilder.buildChunk({usecaseData});
  }

  /**
   * Build AudioCalibrationChunk from audio calibration data entities.
   */
  buildAudioCalibrationChunk(
    audioCalibrationData: CalibrationDataDownloadModel[],
    datapool: DatapoolChunk,
  ): AudioCalibrationChunk {
    return AudioCalibrationChunkBuilder.buildChunk({
      audioCalibrationData,
      datapool,
    }).chunk;
  }

  /**
   * Build VoiceCalibrationChunk from voice calibration data entities.
   */
  buildVoiceCalibrationChunk(
    voiceCalibrationData: CalibrationDataDownloadModel[],
    datapool: DatapoolChunk,
  ): VoiceCalibrationChunkBuildResult {
    return VoiceCalibrationChunkBuilder.buildChunk({
      voiceCalibrationData,
      datapool,
    });
  }

  buildTagKeysChunk(
    tagKeys: TagKeysDownloadModel[],
    datapool: DatapoolChunk,
  ): TagKeysChunk {
    return TagKeysChunkBuilder.buildChunk({tagKeys, datapool}).chunk;
  }

  buildTagDataChunk(
    tagData: TagDataDownloadModel[],
    datapool: DatapoolChunk,
  ): TagDataChunk {
    return TagDataChunkBuilder.buildChunk({tagData, datapool}).chunk;
  }

  buildTaggedModuleMapChunk(
    taggedModules: TaggedModuleDownloadModel[],
  ): TaggedModuleMapChunk {
    return TaggedModuleMapChunkBuilder.buildChunk({taggedModules}).chunk;
  }

  buildDriverCalibrationChunks(
    data: DriverCalibrationDownloadModel[],
    datapool: DatapoolChunk,
  ): DriverCalibrationChunkBuildResult {
    return DriverCalibrationChunkBuilder.buildChunk({
      driverCalibrationData: data,
      datapool,
    });
  }
}
