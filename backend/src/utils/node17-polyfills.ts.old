/**
 * Polyfills for Node.js 17
 * 
 * Node 17 doesn't have native fetch, Headers, ReadableStream, etc.
 * This module provides polyfills for compatibility.
 * 
 * NOTE: Upgrade to Node.js 20+ to avoid needing these polyfills.
 * 
 * eslint-disable-next-line -- Polyfills require 'any' types and require() for global augmentation
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-require-imports */

import fetch, { Headers, Request, Response } from 'node-fetch';
import { ReadableStream, WritableStream, TransformStream } from 'web-streams-polyfill';
import { Blob } from 'fetch-blob';

// Polyfill fetch and related APIs
if (!globalThis.fetch) {
	(globalThis as any).fetch = fetch;
	(globalThis as any).Headers = Headers;
	(globalThis as any).Request = Request;
	(globalThis as any).Response = Response;
}

// Polyfill Blob
if (!globalThis.Blob) {
	(globalThis as any).Blob = Blob;
}

// Polyfill Web Streams API
if (!globalThis.ReadableStream) {
	(globalThis as any).ReadableStream = ReadableStream;
	(globalThis as any).WritableStream = WritableStream;
	(globalThis as any).TransformStream = TransformStream;
}

// Polyfill TextEncoder/TextDecoder (usually available in Node 17, but just in case)
if (!globalThis.TextEncoder) {
	const { TextEncoder, TextDecoder } = require('util');
	(globalThis as any).TextEncoder = TextEncoder;
	(globalThis as any).TextDecoder = TextDecoder;
}

export function ensurePolyfills() {
	// This function just ensures the polyfills are loaded
	// Call it at the top of your entry points
}

