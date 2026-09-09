/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/** SPF parameter, property, and scenario IDs specific to subgraphs. */

// APM subgraph parameter ID
export const PARAM_ID_SUB_GRAPH_CONFIG = 0x08_00_10_01;

// Subgraph Property IDs
export const SUB_GRAPH_PROP_ID_PERF_MODE = 0x08_00_10_0e;
export const SUB_GRAPH_PROP_ID_SCENARIO_ID = 0x08_00_10_10;
export const SUB_GRAPH_PROP_ID_DIRECTION = 0x08_00_10_0f;
export const SUB_GRAPH_PROP_ID_VSID = 0x08_00_10_cc;
export const SUB_GRAPH_PROP_CLOCK_SCALE_FACTOR = 0x08_00_13_74;

// Scenario Values
export const SUB_GRAPH_PROP_ID_SCENARIO_VALUE_AUDIO_PLAYBACK = 0x00_00_00_01;
export const SUB_GRAPH_PROP_ID_SCENARIO_VALUE_AUDIO_RECORDING = 0x00_00_00_02;
export const SUB_GRAPH_PROP_ID_SCENARIO_VALUE_VOICE_CALL = 0x00_00_00_03;
