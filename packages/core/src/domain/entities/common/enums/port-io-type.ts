export const PORT_IO_TYPE = {
  Input: 'INPUT',
  Output: 'OUTPUT',
} as const;

export type PortIoType = (typeof PORT_IO_TYPE)[keyof typeof PORT_IO_TYPE];
