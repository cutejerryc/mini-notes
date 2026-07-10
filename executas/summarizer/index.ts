#!/usr/bin/env node

/**
 * Executa Tool: Notes Summarizer
 * 
 * JSON-RPC 2.0 over stdio implementation with sampling capability.
 * 
 * Protocol:
 * - stdin: JSON-RPC requests (one per line)
 * - stdout: JSON-RPC responses (one per line)
 * - stderr: logs and debug output
 */

import { createInterface } from 'readline';
import { randomUUID } from 'crypto';

interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface SamplingMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface SamplingCreateMessageParams {
  messages: SamplingMessage[];
  max_tokens?: number;
  temperature?: number;
  metadata?: Record<string, unknown>;
}

// Current invoke context for correlating sampling responses
let currentInvokeId: string | null = null;
let currentResolve: ((result: unknown) => void) | null = null;
let currentReject: ((error: Error) => void) | null = null;

const MANIFEST = {
  schema: 'executa/2025-01',
  name: 'tool-dev-summarizer',
  display_name: 'Notes Summarizer',
  version: '0.1.0',
  description: 'Summarizes notes using host LLM via sampling',
  runtime: 'native' as const,
  host_capabilities: ['llm.sample'],
  tools: [
    {
      name: 'summarize',
      display_name: 'Summarize Notes',
      description: 'Summarizes a list of notes using LLM',
      parameters: [
        {
          name: 'notes',
          type: 'array',
          description: 'List of note contents to summarize',
          items: {
            type: 'string',
          },
          required: true,
        },
      ],
    },
  ],
};

function log(...args: unknown[]): void {
  console.error('[summarizer]', ...args);
}

function sendResponse(response: JSONRPCResponse): void {
  console.log(JSON.stringify(response));
  // Ensure flush on stdout
  process.stdout.write('\n');
}

function createErrorResponse(
  id: string | number,
  code: number,
  message: string,
  data?: unknown
): JSONRPCResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message, data },
  };
}

function createSuccessResponse(id: string | number, result: unknown): JSONRPCResponse {
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}

function handleInitialize(request: JSONRPCRequest): void {
  log('Handling initialize request');
  
  const params = request.params as Record<string, unknown> | undefined;
  const protocolVersion = params?.protocol_version ?? '2.0';
  
  // Declare sampling capability in response
  const result = {
    protocol_version: '2.0',
    capabilities: {
      sampling: {},
    },
    server_info: {
      name: MANIFEST.name,
      version: MANIFEST.version,
    },
  };
  
  sendResponse(createSuccessResponse(request.id, result));
}

function handleDescribe(request: JSONRPCRequest): void {
  log('Handling describe request');
  sendResponse(createSuccessResponse(request.id, MANIFEST));
}

function handleHealth(request: JSONRPCRequest): void {
  log('Handling health request');
  sendResponse(createSuccessResponse(request.id, { status: 'healthy', timestamp: Date.now() }));
}

async function handleInvoke(request: JSONRPCRequest): Promise<void> {
  log('Handling invoke request');
  
  const params = request.params as Record<string, unknown> | undefined;
  const toolName = params?.name as string | undefined;
  const arguments_ = params?.arguments as Record<string, unknown> | undefined;
  const invokeId = params?.invoke_id as string | undefined ?? randomUUID();
  
  if (toolName !== 'summarize') {
    sendResponse(
      createErrorResponse(request.id, -32601, `Method not found: ${toolName}`)
    );
    return;
  }
  
  const notes = arguments_?.notes as string[] | undefined;
  
  if (!notes || !Array.isArray(notes) || notes.length === 0) {
    sendResponse(
      createErrorResponse(request.id, -32602, 'Invalid params: notes must be a non-empty array')
    );
    return;
  }
  
  // Store invoke context for sampling response correlation
  currentInvokeId = invokeId;
  
  // Create sampling request
  const notesText = notes.map((note, i) => `${i + 1}. ${note}`).join('\n');
  const prompt = `Please summarize the following notes in a concise paragraph:\n\n${notesText}`;
  
  const samplingParams: SamplingCreateMessageParams = {
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    max_tokens: 500,
    temperature: 0.7,
    metadata: {
      invoke_id: invokeId,
      tool_name: 'summarize',
      notes_count: notes.length,
    },
  };

  const samplingRequest: JSONRPCRequest = {
    jsonrpc: '2.0',
    id: `sampling-${Date.now()}`,
    method: 'sampling/createMessage',
    params: samplingParams as unknown as Record<string, unknown>,
  };
  
  log('Sending sampling request:', JSON.stringify(samplingRequest));
  
  // Send sampling request to host via stdout
  console.log(JSON.stringify(samplingRequest));
  process.stdout.write('\n');
  
  // Wait for sampling response via promise
  const samplingResponse = await new Promise<unknown>((resolve, reject) => {
    currentResolve = resolve;
    currentReject = reject;
    
    // Timeout after 30 seconds
    setTimeout(() => {
      if (currentResolve) {
        reject(new Error('Sampling timeout'));
      }
    }, 30000);
  });
  
  // Process sampling response
  const samplingResult = samplingResponse as Record<string, unknown>;
  const content = samplingResult.content as string | undefined;
  
  if (!content) {
    sendResponse(
      createErrorResponse(request.id, -32603, 'Sampling returned empty content')
    );
    return;
  }
  
  sendResponse(
    createSuccessResponse(request.id, {
      summary: content,
      notes_count: notes.length,
    })
  );
}

function handleShutdown(request: JSONRPCRequest): void {
  log('Handling shutdown request');
  sendResponse(createSuccessResponse(request.id, { acknowledged: true }));
  process.exit(0);
}

function handleSamplingResponse(response: JSONRPCResponse): void {
  log('Received sampling response:', JSON.stringify(response));
  
  if (response.error) {
    if (currentReject) {
      currentReject(new Error(response.error.message));
      currentReject = null;
      currentResolve = null;
    }
    return;
  }
  
  if (currentResolve) {
    currentResolve(response.result ?? {});
    currentResolve = null;
    currentReject = null;
  }
}

async function processRequest(line: string): Promise<void> {
  if (!line.trim()) return;
  
  log('Received:', line);
  
  let request: JSONRPCRequest;
  try {
    request = JSON.parse(line);
  } catch (error) {
    sendResponse(
      createErrorResponse(-1, -32700, 'Parse error', error instanceof Error ? error.message : 'Unknown')
    );
    return;
  }
  
  // Check if this is a response (has result or error, no method)
  const maybeResponse = request as JSONRPCResponse;
  if (!request.method && (maybeResponse.result !== undefined || maybeResponse.error !== undefined)) {
    // This is a response to our sampling request
    handleSamplingResponse(maybeResponse);
    return;
  }
  
  switch (request.method) {
    case 'initialize':
      handleInitialize(request);
      break;
    case 'describe':
      handleDescribe(request);
      break;
    case 'health':
      handleHealth(request);
      break;
    case 'invoke':
      await handleInvoke(request);
      break;
    case 'shutdown':
      handleShutdown(request);
      break;
    default:
      sendResponse(
        createErrorResponse(request.id, -32601, `Method not found: ${request.method}`)
      );
  }
}

async function main(): Promise<void> {
  log('Executa Tool: Notes Summarizer starting...');
  log('Waiting for JSON-RPC requests on stdin');
  
  const rl = createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });
  
  rl.on('line', async (line) => {
    try {
      await processRequest(line);
    } catch (error) {
      log('Error processing request:', error);
      sendResponse(
        createErrorResponse(-1, -32603, 'Internal error', error instanceof Error ? error.message : 'Unknown')
      );
    }
  });
  
  rl.on('close', () => {
    log('stdin closed, exiting');
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
