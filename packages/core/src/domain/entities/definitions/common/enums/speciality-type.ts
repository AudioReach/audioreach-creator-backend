export const SpecialKey = {
  None: 'None',
  Shared: 'SampleRate',
  GlobalShared: 'Volume',
} as const;

export type SpecialKey = (typeof SpecialKey)[keyof typeof SpecialKey];