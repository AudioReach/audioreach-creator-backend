/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * SPF (Signal Processing Framework) Parameter and Property IDs
 */

// Container property and heap IDs are defined in the domain and re-exported
// here for file-operation consumers.
export * from './container/container-property-ids.js';

// APM Module IDs
export const SPF_APM_MODULE_ID = 0x00_00_00_01;
export const SPF_VCPM_MODULE_ID = 0x00_00_00_04;

// APM Parameter IDs
export const PARAM_ID_CONTAINER_CONFIG = 0x08_00_10_00;
export const PARAM_ID_MODULES_LIST = 0x08_00_10_02;
export const PARAM_ID_MODULE_PROP = 0x08_00_10_03;
export const PARAM_ID_MODULE_DATA_LINK = 0x08_00_10_04;
export const PARAM_ID_MODULE_CTRL_LINK = 0x08_00_10_61;

// VCPM Parameter IDs
export const SPF_VCPM_PARAM_ID_CAL_KEYS = 0x08_00_11_c1;
export const PARAM_ID_VOICE_SG_CONFIG = 0x08_00_11_62;
export const PARAM_ID_VOICE_CAL_TBL = 0x08_00_11_63;

// Module Property IDs
export const MODULE_PROP_ID_PORT_INFO = 0x08_00_10_15;
export const MODULE_PROP_ID_HEAP_ID = 0x08_00_1a_9a;
export const MODULE_PROP_ID_CTRL_LINK_INTENTS = 0x08_00_10_62;
export const MODULE_PROP_ID_CTRL_HEAP_ID = 0x08_00_13_6f;

// VCPM Property IDs
export const VCPM_PROP_ID_TAG_INFO = 0x08_00_11_b2;

// Other Constants
export const ID_DONT_CARE_DUMMY = 0xff_ff_ff_ff;
export const SPF_ID = 0xff_ff_ff_fe;
