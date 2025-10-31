const PID_TYPE = {
  None: 'none',
  Shared: 'shared',
  GlobalShared: 'globalshared',
} as const;

export type PID_TYPE = (typeof PID_TYPE)[keyof typeof PID_TYPE];