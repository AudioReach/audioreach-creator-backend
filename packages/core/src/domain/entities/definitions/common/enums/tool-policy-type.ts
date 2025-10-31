const TOOL_POLICY = {
  UNKNOWN: 'unknown',
  NO_SUPPORT: 'no_support',
  CALIBRATION: 'calibration',
  RTC: 'rtc',  
  RTC_READONLY: 'rtc_readonly',
  RTM: 'rtm',
} as const;

export type TOOL_POLICY = (typeof TOOL_POLICY)[keyof typeof TOOL_POLICY];