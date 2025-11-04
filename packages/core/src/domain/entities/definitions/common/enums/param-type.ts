const PARAM_TYPE = {
  None: 'NONE',
  Shared: 'SHARED',
  GlobalShared: 'GLOBAL_SHARED',
} as const;

export type ParamType = (typeof PARAM_TYPE)[keyof typeof PARAM_TYPE];
