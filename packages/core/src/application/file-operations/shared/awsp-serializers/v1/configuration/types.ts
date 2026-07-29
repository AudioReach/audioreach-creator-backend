/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

// Canonical source moved to domain layer — re-exported here for backwards compatibility.
export {
  MODULE_PORT_STRATEGIES,
  type ModulePortStrategy,
} from '../../../../../../domain/entities/common/enums/module-port-strategy.js';

/**
 * Valid processor domain values.
 * Defines the processor domains that can be used in the system.
 */
export const PROCESSOR_DOMAINS = {
  /**
   * Unknown or unspecified processor domain
   */
  UNKNOWN: 'UNKNOWN',

  /**
   * Audio DSP (Digital Signal Processor) domain
   */
  ADSP: 'ADSP',

  /**
   * Modem DSP domain
   */
  MDSP: 'MDSP',

  /**
   * Compute DSP domain
   */
  CDSP: 'CDSP',

  /**
   * Sensor DSP domain
   */
  SDSP: 'SDSP',
} as const;

/**
 * Type representing valid processor domain values
 */
export type ProcessorDomain =
  (typeof PROCESSOR_DOMAINS)[keyof typeof PROCESSOR_DOMAINS];

/**
 * Valid file type values for ALSA lib configuration.
 */
export const ALSA_FILE_TYPES = {
  /**
   * Binary file format
   */
  BIN: 'BIN',

  /**
   * Text file format
   */
  TEXT: 'TEXT',
} as const;

/**
 * Type representing valid ALSA file type values
 */
export type AlsaFileType =
  (typeof ALSA_FILE_TYPES)[keyof typeof ALSA_FILE_TYPES];
