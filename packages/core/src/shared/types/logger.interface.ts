export interface Logger {
  logVerbose(data: LogData): void;
  logDebug(data: LogData): void;
  logInfo(data: LogData): void;
  logWarn(data: LogData): void;
  logError(data: LogData): void;
  logCritical(data: LogData): void;
}

export interface LogData {
  /** The main log message describing what happened */
  msg: string;
  /** Timestamp when the log event occurred */
  timestamp: Date;
  /** Identifier of the client application or API consumer */
  clientId?: string;
  /** Identifier of the project/workspace context where the action occurred */
  projectId?: string;
  /** Specific action or operation that was performed */
  action: string;
  /** The component, service, or module that generated this log entry */
  component: string;
  /** Categorization tag for grouping related log entries */
  tag: string;
  /** Error object containing details when logging error-level events */
  error?: Error;
}

/** Even though there is no generic log method in ILogger interface, this is to maintain consistency on dependent packages */
export const LogLevel = {
  Verbose: 'verbose',
  Debug: 'debug',
  Info: 'info',
  Warn: 'warn',
  Error: 'error',
  Critical: 'critical',
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];
