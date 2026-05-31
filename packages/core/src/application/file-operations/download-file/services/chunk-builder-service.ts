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
import type {HeaderChunk} from '../../shared/acdb-chunks/header-chunk.js';
import type {UsecaseDataChunk} from '../../shared/acdb-chunks/usecase-data-chunk.js';
import type {AudioCalibrationChunk} from '../../shared/acdb-chunks/audio-calibration-chunk.js';
import type {DatapoolChunk} from '../../shared/acdb-chunks/datapool-chunk.js';
import type {
  ProjectHeaderMetadata,
  UsecaseDataDownloadModel,
  CalibrationDataDownloadModel,
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
   *
   * @param headerMetadata - Header metadata from database
   * @returns Populated HeaderChunk ready for serialization
   */
  buildHeaderChunk(headerMetadata: ProjectHeaderMetadata): HeaderChunk {
    return HeaderChunkBuilder.buildChunk({headerMetadata});
  }

  /**
   * Build UsecaseDataChunk from usecase data entities.
   *
   * @param usecaseData - Usecase data from database with natural IDs
   * @returns Populated UsecaseDataChunk ready for serialization
   */
  buildUsecaseDataChunk(
    usecaseData: UsecaseDataDownloadModel[],
  ): UsecaseDataChunk {
    return UsecaseDataChunkBuilder.buildChunk({usecaseData});
  }

  /**
   * Build AudioCalibrationChunk from audio calibration data entities.
   *
   * @param audioCalibrationData - Audio calibration data from database with natural IDs
   * @returns Populated AudioCalibrationChunk ready for serialization (chunk only, metadata discarded)
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
   *
   * @param voiceCalibrationData - Voice calibration data from database with natural IDs
   * @returns Populated VoiceCalibrationChunk ready for serialization and metadata for DOT entry creation
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
}
