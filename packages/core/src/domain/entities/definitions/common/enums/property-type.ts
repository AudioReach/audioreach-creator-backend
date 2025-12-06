export const PROPERTY_TYPE = {
  Spf: 'SPF',
  Driver: 'DRIVER',
} as const;

export type PropertyType = (typeof PROPERTY_TYPE)[keyof typeof PROPERTY_TYPE];
