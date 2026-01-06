/**
 * Configuration utility
 */

// Define LogLevel type directly rather than importing from logger
type LogLevel = "debug" | "info" | "warn" | "error";

export interface AppConfig {
  port: number;
  environment: "development" | "staging" | "production";
  logging: {
    level: LogLevel;
    silent: boolean;
  };
  api: {
    timeout: number;
    retries: number;
  };
  database: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
  redis: {
    host: string;
    port: number;
    password: string;
    keyPrefix: string;
    useTLS: boolean;
  };
}

/**
 * Default configuration with sensible defaults
 */
export const defaultConfig: AppConfig = {
  port: 3000,
  environment: "development",
  logging: {
    level: "info",
    silent: false,
  },
  api: {
    timeout: 5000,
    retries: 3,
  },
  database: {
    host: "localhost",
    port: 5432,
    user: "postgres",
    password: "postgres",
    database: "senate",
  },
  redis: {
    host: "localhost",
    port: 6379,
    password: "",
    keyPrefix: "senate",
    useTLS: false,
  },
};

/**
 * Load configuration from environment variables and merge with defaults
 */
export function loadConfig(): AppConfig {
  return {
    port: parseInt(process.env.PORT || defaultConfig.port.toString(), 10),
    environment:
      (process.env.NODE_ENV as AppConfig["environment"]) ||
      defaultConfig.environment,
    logging: {
      level: (process.env.LOG_LEVEL as LogLevel) || defaultConfig.logging.level,
      silent: process.env.LOG_SILENT === "true" || defaultConfig.logging.silent,
    },
    api: {
      timeout: parseInt(
        process.env.API_TIMEOUT || defaultConfig.api.timeout.toString(),
        10
      ),
      retries: parseInt(
        process.env.API_RETRIES || defaultConfig.api.retries.toString(),
        10
      ),
    },
    database: {
      host: process.env.DB_HOST || defaultConfig.database.host,
      port: parseInt(
        process.env.DB_PORT || defaultConfig.database.port.toString(),
        10
      ),
      user: process.env.DB_USER || defaultConfig.database.user,
      password: process.env.DB_PASSWORD || defaultConfig.database.password,
      database: process.env.DB_NAME || defaultConfig.database.database,
    },
    redis: {
      host: process.env.REDIS_HOST || defaultConfig.redis.host,
      port: parseInt(
        process.env.REDIS_PORT || defaultConfig.redis.port.toString(),
        10
      ),
      password: process.env.REDIS_PASSWORD || defaultConfig.redis.password,
      keyPrefix: process.env.REDIS_KEY_PREFIX || defaultConfig.redis.keyPrefix,
      useTLS:
        process.env.REDIS_USE_TLS === "true" || defaultConfig.redis.useTLS,
    },
  };
}

// Export a singleton instance of the config
export const config = loadConfig();
