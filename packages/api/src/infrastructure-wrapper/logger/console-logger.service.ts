import {Injectable} from '@nestjs/common';
import {type Logger, type LogData, LogLevel} from '@arc/core';

@Injectable()
export class ConsoleLoggerService implements Logger {
  async logVerbose(data: LogData): Promise<void> {
    this.log(LogLevel.Verbose, data);
  }

  async logDebug(data: LogData): Promise<void> {
    this.log(LogLevel.Debug, data);
  }

  async logInfo(data: LogData): Promise<void> {
    this.log(LogLevel.Info, data);
  }

  async logWarn(data: LogData): Promise<void> {
    this.log(LogLevel.Warn, data);
  }

  async logError(data: LogData): Promise<void> {
    this.log(LogLevel.Error, data);
  }

  async logCritical(data: LogData): Promise<void> {
    this.log(LogLevel.Critical, data);
  }

  private log(level: LogLevel, data: LogData): void {
    const logEntry = this.formatLogEntry(level, data);

    switch (level) {
      case LogLevel.Verbose:
      case LogLevel.Debug:
        console.debug(logEntry);
        break;
      case LogLevel.Info:
        console.info(logEntry);
        break;
      case LogLevel.Warn:
        console.warn(logEntry);
        break;
      case LogLevel.Error:
      case LogLevel.Critical:
        console.error(logEntry);
        if (data.error) {
          console.error(data.error);
        }
        break;
    }
  }

  private formatLogEntry(level: LogLevel, data: LogData): string {
    const timestamp = data.timestamp.toISOString();
    const parts = [
      `[${timestamp}]`,
      `[${level.toUpperCase()}]`,
      `[${data.component}]`,
      `[${data.action}]`,
    ];

    if (data.tag) {
      parts.push(`[${data.tag}]`);
    }

    if (data.clientId) {
      parts.push(`[Client: ${data.clientId}]`);
    }

    if (data.projectId) {
      parts.push(`[Project: ${data.projectId}]`);
    }

    parts.push(data.msg);

    return parts.join(' ');
  }
}
