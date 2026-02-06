/**
 * SPF (Signal Processing Framework) Parameter and Property IDs
 * Ported from C# Constants.cs
 */

// APM Module IDs
export const SPF_APM_MODULE_ID = 0x00_00_00_01;
export const SPF_VCPM_MODULE_ID = 0x00_00_00_04;

// APM Parameter IDs
export const PARAM_ID_SUB_GRAPH_CONFIG = 0x08_00_10_01;
export const PARAM_ID_CONTAINER_CONFIG = 0x08_00_10_00;
export const PARAM_ID_MODULES_LIST = 0x08_00_10_02;
export const PARAM_ID_MODULE_PROP = 0x08_00_10_03;
export const PARAM_ID_MODULE_DATA_LINK = 0x08_00_10_04;
export const PARAM_ID_MODULE_CTRL_LINK = 0x08_00_10_61;

// VCPM Parameter IDs
export const SPF_VCPM_PARAM_ID_CAL_KEYS = 0x08_00_11_c1;
export const PARAM_ID_VOICE_SG_CONFIG = 0x08_00_11_62;
export const PARAM_ID_VOICE_CAL_TBL = 0x08_00_11_63;

// Subgraph Property IDs
export const SUB_GRAPH_PROP_ID_PERF_MODE = 0x08_00_10_0e;
export const SUB_GRAPH_PROP_ID_SCENARIO_ID = 0x08_00_10_10;
export const SUB_GRAPH_PROP_ID_DIRECTION = 0x08_00_10_0f;
export const SUB_GRAPH_PROP_ID_VSID = 0x08_00_10_cc;
export const SUB_GRAPH_PROP_CLOCK_SCALE_FACTOR = 0x08_00_13_74;

// Container Property IDs
export const CONTAINER_PROP_ID_CAPABILITY_LIST = 0x08_00_10_11;
export const CONTAINER_PROP_ID_GRAPH_POS = 0x08_00_10_12;
export const CONTAINER_PROP_ID_STACK_SIZE = 0x08_00_10_13;
export const CONTAINER_PROP_ID_PROC_DOMAIN = 0x08_00_10_14;
export const CONTAINER_PROP_ID_PARENT_CONTAINER = 0x08_00_10_cb;
export const CONTAINER_HEAP_PROP_ID = 0x08_00_11_74;
export const CONTAINER_PROP_ID_FRAME_SIZE = 0x08_00_1a_9b;

// Module Property IDs
export const MODULE_PROP_ID_PORT_INFO = 0x08_00_10_15;
export const MODULE_PROP_ID_HEAP_ID = 0x08_00_1a_9a;
export const MODULE_PROP_ID_CTRL_LINK_INTENTS = 0x08_00_10_62;
export const MODULE_PROP_ID_CTRL_HEAP_ID = 0x08_00_13_6f;

// VCPM Property IDs
export const VCPM_PROP_ID_TAG_INFO = 0x08_00_11_b2;

// Scenario Values
export const SUB_GRAPH_PROP_ID_SCENARIO_VALUE_AUDIO_PLAYBACK = 0x00_00_00_01;
export const SUB_GRAPH_PROP_ID_SCENARIO_VALUE_AUDIO_RECORDING = 0x00_00_00_02;
export const SUB_GRAPH_PROP_ID_SCENARIO_VALUE_VOICE_CALL = 0x00_00_00_03;

// Heap IDs
export const HEAP_ID_DEFAULT = 1;
export const HEAP_ID_LOW_POWER = 2;

// Other Constants
export const DEFAULT_CONTAINER_STACK_SIZE = 0xff_ff_ff_ff;
export const ID_DONT_CARE_DUMMY = 0xff_ff_ff_ff;
export const SPF_ID = 0xff_ff_ff_fe;
