/**
 * SamplingClient — issue reverse `sampling/createMessage` JSON-RPC requests
 * to the host Agent (Anna).
 *
 * Adapted from the anna-executa-examples SDK.
 */

"use strict";

const crypto = require("node:crypto");

const PROTOCOL_VERSION_V1 = "1.1";
const PROTOCOL_VERSION_V2 = "2.0";

const METHOD_SAMPLING_CREATE_MESSAGE = "sampling/createMessage";

const SAMPLING_ERR_TIMEOUT = -32005;
const SAMPLING_ERR_NOT_NEGOTIATED = -32008;

class SamplingError extends Error {
  constructor(code, message, data) {
    super(`[${code}] ${message}`);
    this.name = "SamplingError";
    this.code = code;
    this.data = data || {};
  }
}

class SamplingClient {
  constructor(opts = {}) {
    this._writeFrame =
      opts.writeFrame ||
      ((msg) => {
        process.stdout.write(JSON.stringify(msg) + "\n");
      });
    this._pending = new Map();
    this._disabledReason = null;
  }

  disable(reason) {
    this._disabledReason = reason;
  }

  /**
   * Ask the host to run an LLM completion.
   */
  createMessage(params) {
    if (this._disabledReason) {
      return Promise.reject(
        new SamplingError(SAMPLING_ERR_NOT_NEGOTIATED, this._disabledReason)
      );
    }
    const {
      messages,
      maxTokens,
      systemPrompt,
      temperature,
      stopSequences,
      modelPreferences,
      includeContext = "none",
      metadata,
      timeoutMs = 90_000,
    } = params || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return Promise.reject(new TypeError("messages must be a non-empty array"));
    }
    if (!Number.isInteger(maxTokens) || maxTokens <= 0) {
      return Promise.reject(new TypeError("maxTokens must be a positive integer"));
    }

    const reqId = crypto.randomUUID();
    const rpcParams = { messages, maxTokens, includeContext };
    if (systemPrompt != null) rpcParams.systemPrompt = systemPrompt;
    if (temperature != null) rpcParams.temperature = temperature;
    if (stopSequences) rpcParams.stopSequences = stopSequences;
    if (modelPreferences) rpcParams.modelPreferences = modelPreferences;
    if (metadata) rpcParams.metadata = metadata;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this._pending.delete(reqId)) {
          reject(
            new SamplingError(
              SAMPLING_ERR_TIMEOUT,
              `sampling/createMessage timed out after ${timeoutMs}ms`
            )
          );
        }
      }, timeoutMs);
      this._pending.set(reqId, { resolve, reject, timer });

      try {
        this._writeFrame({
          jsonrpc: "2.0",
          id: reqId,
          method: METHOD_SAMPLING_CREATE_MESSAGE,
          params: rpcParams,
        });
      } catch (err) {
        clearTimeout(timer);
        this._pending.delete(reqId);
        reject(err);
      }
    });
  }

  /**
   * Try to resolve the matching pending request.
   * Returns true if msg was a response we owned.
   */
  dispatchResponse(msg) {
    if (!msg || typeof msg !== "object" || "method" in msg) return false;
    const id = msg.id;
    if (id == null) return false;
    const pending = this._pending.get(id);
    if (!pending) return false;
    this._pending.delete(id);
    clearTimeout(pending.timer);
    if (msg.error) {
      pending.reject(
        new SamplingError(
          Number(msg.error.code) || -32603,
          String(msg.error.message || "unknown error"),
          msg.error.data
        )
      );
    } else {
      pending.resolve(msg.result || {});
    }
    return true;
  }
}

module.exports = {
  SamplingClient,
  SamplingError,
  PROTOCOL_VERSION_V1,
  PROTOCOL_VERSION_V2,
};
