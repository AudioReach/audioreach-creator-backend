const PROPERTY_TYPE = {
  SPF: 'spf',
  Driver: 'driver',
} as const;

export type PROPERTY_TYPE = (typeof PROPERTY_TYPE)[keyof typeof PROPERTY_TYPE];