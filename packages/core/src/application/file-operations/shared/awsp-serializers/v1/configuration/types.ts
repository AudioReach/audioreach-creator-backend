/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Valid port strategy values for module ports.
 * Defines how port IDs are assigned to input and output ports.
 */
export const MODULE_PORT_STRATEGIES = {
  //TODO: Fix this. OUTPUT_ODD_INPUT_EVEN is correct.
  //update conversion and here accordingly
  /**
   * Input ports use odd IDs (1, 3, 5, 7...)
   * Output ports use even IDs (2, 4, 6, 8...)
   */
  INPUT_ODD_OUTPUT_EVEN: 'INPUT_ODD_OUTPUT_EVEN',

  /**
   * Both input and output ports use sequential IDs starting from 1
   * Input ports: 1, 2, 3, 4...
   * Output ports: 1, 2, 3, 4...
   */
  SEQUENTIAL: 'SEQUENTIAL',
} as const;

/**
 * Type representing valid port strategy values
 */
export type ModulePortStrategy =
  (typeof MODULE_PORT_STRATEGIES)[keyof typeof MODULE_PORT_STRATEGIES];

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
  BIN: 'Bin',

  /**
   * Text file format
   */
  TEXT: 'Text',
} as const;

/**
 * Type representing valid ALSA file type values
 */
export type AlsaFileType =
  (typeof ALSA_FILE_TYPES)[keyof typeof ALSA_FILE_TYPES];
