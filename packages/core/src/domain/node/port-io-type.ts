export const PortIoType = {
  Input: "Input",
  Output: "Output",
} as const;

export type PortIoType = (typeof PortIoType)[keyof typeof PortIoType];
