const TOOL_POLICY = {
  Unknown: 'UNKNOWN',
  NoSupport: 'NO_SUPPORT',
  Calibration: 'CALIBRATION',
  Rtc: 'RTC',
  RtcReadonly: 'RTC_READONLY',
  Rtm: 'RTM',
} as const;

export type ToolPolicy = (typeof TOOL_POLICY)[keyof typeof TOOL_POLICY];
