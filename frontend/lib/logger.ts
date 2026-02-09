type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogMetadata {
  [key: string]: unknown;
}

interface LogObject extends LogMetadata {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * Lightweight browser logger matching the backend Logger API.
 * Outputs structured JSON via console methods.
 */
export class Logger {
  private serviceName: string;

  constructor(options: { serviceName: string }) {
    this.serviceName = options.serviceName;
  }

  private log(level: LogLevel, message: string, error?: Error, metadata?: LogMetadata) {
    const logObject: LogObject = {
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      message,
      ...metadata,
    };

    if (error) {
      logObject.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    const output = JSON.stringify(logObject, null, 2);

    switch (level) {
      case 'DEBUG':
        console.debug(output);
        break;
      case 'INFO':
        console.info(output);
        break;
      case 'WARN':
        console.warn(output);
        break;
      case 'ERROR':
        console.error(output);
        break;
    }
  }

  debug(message: string, metadata?: LogMetadata) {
    this.log('DEBUG', message, undefined, metadata);
  }

  info(message: string, metadata?: LogMetadata) {
    this.log('INFO', message, undefined, metadata);
  }

  warn(message: string, error?: Error, metadata?: LogMetadata) {
    this.log('WARN', message, error, metadata);
  }

  error(message: string, error: Error, metadata?: LogMetadata) {
    this.log('ERROR', message, error, metadata);
  }
}
