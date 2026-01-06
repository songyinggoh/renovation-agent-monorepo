/**
 * HTTP Error handling utilities
 */

import { Request, Response, NextFunction } from "express";
import { Logger } from "./logger.js";

// Create a logger instance for HTTP errors
const logger = new Logger({ serviceName: "http-errors" });

export interface HttpErrorOptions {
	statusCode: number;
	message: string;
	code?: string;
	details?: Record<string, unknown>;
}

export class HttpError extends Error {
	statusCode: number;
	code: string;
	details?: Record<string, unknown>;

	constructor(options: HttpErrorOptions) {
		super(options.message);
		this.statusCode = options.statusCode;
		this.code = options.code || this.mapStatusToCode(options.statusCode);
		this.details = options.details;
		Error.captureStackTrace(this, HttpError);
	}

	private mapStatusToCode(statusCode: number): string {
		switch (statusCode) {
			case 400:
				return "BAD_REQUEST";
			case 401:
				return "UNAUTHORIZED";
			case 403:
				return "FORBIDDEN";
			case 404:
				return "NOT_FOUND";
			case 409:
				return "CONFLICT";
			case 422:
				return "UNPROCESSABLE_ENTITY";
			case 500:
				return "INTERNAL_SERVER_ERROR";
			default:
				return "UNKNOWN_ERROR";
		}
	}
}

export const errorTypes = {
	badRequest: (message: string, details?: Record<string, unknown>) =>
		new HttpError({ statusCode: 400, message, details }),

	unauthorized: (message: string, details?: Record<string, unknown>) =>
		new HttpError({ statusCode: 401, message, details }),

	forbidden: (message: string, details?: Record<string, unknown>) =>
		new HttpError({ statusCode: 403, message, details }),

	notFound: (message: string, details?: Record<string, unknown>) =>
		new HttpError({ statusCode: 404, message, details }),

	conflict: (message: string, details?: Record<string, unknown>) =>
		new HttpError({ statusCode: 409, message, details }),

	validation: (message: string, details?: Record<string, unknown>) =>
		new HttpError({ statusCode: 422, message, details }),

	internal: (message: string, details?: Record<string, unknown>) =>
		new HttpError({ statusCode: 500, message, details }),
};

/**
 * Express error handler middleware
 */
export const errorHandler = (
	err: Error | HttpError,
	req: Request,
	res: Response,
	next: NextFunction
) => {
	if (res.headersSent) {
		return next(err);
	}

	const isHttpError = err instanceof HttpError;
	const statusCode = isHttpError ? err.statusCode : 500;
	const code = isHttpError ? err.code : "INTERNAL_SERVER_ERROR";
	const message = isHttpError ? err.message : "An unexpected error occurred";
	const details = isHttpError ? err.details : undefined;

	// Log the error
	const errorContext = {
		path: req.path,
		method: req.method,
		statusCode,
		code,
		...(details || {}),
	};

	logger.error(`HTTP Error: ${message}`, err, errorContext);

	// Send error response
	res.status(statusCode).json({
		success: false,
		error: {
			code,
			message,
			...(details ? { details } : {}),
		},
	});
};

/**
 * Not found middleware for unmatched routes
 */
export const notFoundHandler = (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const error = errorTypes.notFound(
		`Route not found: ${req.method} ${req.path}`
	);
	next(error);
};
