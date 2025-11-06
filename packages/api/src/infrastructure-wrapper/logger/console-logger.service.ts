import {Injectable, type OnModuleDestroy} from '@nestjs/common';
import {type Logger, type LogData, LogLevel} from '@arc/core';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

@Injectable()
export class ConsoleLoggerService implements Logger, OnModuleDestroy {
  private logFilePath: string;
  private logStream: fs.WriteStream;

  constructor() {
    // Create logs directory in the project root
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, {recursive: true});
    }

    // Create log file with timestamp
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    this.logFilePath = path.join(logsDir, `server-debug-${timestamp}.log`);
    this.logStream = fs.createWriteStream(this.logFilePath, {flags: 'a'});

    // Log startup information
    this.logInfo({
      component: 'Logger',
      action: 'initialize',
      msg: `Logger initialized. Writing to ${this.logFilePath}`,
      timestamp: new Date(),
      tag: 'startup',
    });
  }
  async onModuleDestroy() {
    // Properly close the stream on shutdown
    return new Promise<void>(resolve => {
      this.logStream.end(() => {
        resolve();
      });
    });
  }

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

    // Write to file
    this.logStream.write(logEntry + os.EOL);

    // Also log to console
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
          // Also write error stack to file
          if (data.error.stack) {
            this.logStream.write(`STACK: ${data.error.stack}${os.EOL}`);
          }
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
