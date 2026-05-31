/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Handler} from '../../../ports/worker/handler-registry.port.js';
import {HANDLER_KEYS} from '../../shared/constants/registry-keys.js';
import {
  HeaderChunkBuilder,
  type HeaderChunkBuildInput,
} from '../services/chunk-builders/header-chunk-builder.js';
import {
  UsecaseDataChunkBuilder,
  type UsecaseDataChunkBuildInput,
} from '../services/chunk-builders/usecase-data-chunk-builder.js';
import {
  AudioCalibrationChunkBuilder,
  type AudioCalibrationChunkBuildInput,
} from '../services/chunk-builders/audio-calibration-chunk-builder.js';
import {
  VoiceCalibrationChunkBuilder,
  type VoiceCalibrationChunkBuildInput,
} from '../services/chunk-builders/voice-calibration-chunk-builder.js';

/**
 * Registry of chunk building handlers for Level 3 parallelization.
 * These handlers run in sub-workers to build chunk batches concurrently.
 *
 * Usage:
 * ```typescript
 * const registry = createChunkBuilderRegistry();
 * const handler = registry[HANDLER_KEYS.BUILD_USECASE_DATA_CHUNK];
 * const result = await handler(input);
 * ```
 */
export function createChunkBuilderRegistry(): Record<
  string,
  Handler<unknown, unknown, unknown>
> {
  return {
    [HANDLER_KEYS.BUILD_HEADER_CHUNK]: (input: unknown) =>
      HeaderChunkBuilder.buildChunk(input as HeaderChunkBuildInput),
    [HANDLER_KEYS.BUILD_USECASE_DATA_CHUNK]: (input: unknown) =>
      UsecaseDataChunkBuilder.buildChunk(input as UsecaseDataChunkBuildInput),
    [HANDLER_KEYS.BUILD_AUDIO_CAL_CHUNK]: (input: unknown) =>
      AudioCalibrationChunkBuilder.buildChunk(
        input as AudioCalibrationChunkBuildInput,
      ),
    [HANDLER_KEYS.BUILD_VOICE_CAL_CHUNK]: (input: unknown) =>
      VoiceCalibrationChunkBuilder.buildChunk(
        input as VoiceCalibrationChunkBuildInput,
      ),
  };
}
