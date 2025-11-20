export const PORT_IO_TYPE = {
  Input: 'Input',
  Output: 'Output',
} as const;

export type PortIoType = (typeof PORT_IO_TYPE)[keyof typeof PORT_IO_TYPE];
