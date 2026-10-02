/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from '@google/genai';

export interface AIProviderConfig {
  providerType: 'gemini' | 'deterministic' | 'mock';
  apiKey?: string;
  modelName: string;
}

export interface AIProviderResponse<T> {
  success: boolean;
  data?: T;
  rawText?: string;
  error?: string;
  provider: 'gemini' | 'deterministic';
  modelUsed?: string;
  durationMs: number;
}

export interface AIProvider {
  name: 'gemini' | 'deterministic';
  isAvailable(): boolean;
  generateJSON<T>(
    systemInstruction: string,
    userPrompt: string,
    fallbackValue: T
  ): Promise<AIProviderResponse<T>>;
}

/**
 * Gemini Provider using modern @google/genai SDK
 * Configured via process.env.GEMINI_API_KEY & process.env.AI_MODEL
 */
export class GeminiAIProvider implements AIProvider {
  public readonly name = 'gemini';
  private client: GoogleGenAI | null = null;
  private modelName: string;
  private cooldownUntil = 0;

  constructor(apiKey?: string, modelName = 'gemini-3.8-flash') {
    this.modelName = process.env.AI_MODEL || modelName;
    const key = apiKey || process.env.GEMINI_API_KEY;

    if (key && key !== 'MY_GEMINI_API_KEY' && key.trim().length > 0) {
      try {
        this.client = new GoogleGenAI({
          apiKey: key,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });
      } catch (err) {
        console.warn('[GeminiAIProvider] Failed to initialize GoogleGenAI client:', err);
        this.client = null;
      }
    }
  }

  public isAvailable(): boolean {
    const key = process.env.GEMINI_API_KEY;
    return !!(this.client && key && key !== 'MY_GEMINI_API_KEY' && key.trim().length > 0);
  }

  public async generateJSON<T>(
    systemInstruction: string,
    userPrompt: string,
    fallbackValue: T
  ): Promise<AIProviderResponse<T>> {
    const start = Date.now();

    if (Date.now() < this.cooldownUntil) {
      return {
        success: false,
        data: fallbackValue,
        error: 'AI Provider in temporary cooldown due to rate limit/quota, using deterministic fallback.',
        provider: 'gemini',
        modelUsed: this.modelName,
        durationMs: 1,
      };
    }

    if (!this.isAvailable() || !this.client) {
      return {
        success: false,
        data: fallbackValue,
        error: 'Gemini API key is not configured or client initialization failed. Falling back to deterministic engine.',
        provider: 'gemini',
        modelUsed: this.modelName,
        durationMs: Date.now() - start,
      };
    }

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI provider call timed out after 3500ms (switching to deterministic fallback)')), 3500)
      );

      const response = await Promise.race([
        this.client.models.generateContent({
          model: this.modelName,
          contents: userPrompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            temperature: 0.2, // Low temperature for factual reliability
          },
        }),
        timeoutPromise
      ]);

      const raw = response.text?.trim() || '';
      if (!raw) {
        throw new Error('Received empty response from Gemini API.');
      }

      // Safe JSON parse handling markdown fence or whitespace quirks
      let cleaned = raw;
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
      }

      const parsed = JSON.parse(cleaned) as T;

      return {
        success: true,
        data: parsed,
        rawText: raw,
        provider: 'gemini',
        modelUsed: this.modelName,
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      if (err?.message?.includes('429') || err?.message?.includes('RESOURCE_EXHAUSTED') || err?.message?.includes('503')) {
        this.cooldownUntil = Date.now() + 30000;
      }
      console.warn('[GeminiAIProvider] Execution failed, using safe fallback:', err?.message || err);
      return {
        success: false,
        data: fallbackValue,
        error: err?.message || 'Gemini API call failed',
        provider: 'gemini',
        modelUsed: this.modelName,
        durationMs: Date.now() - start,
      };
    }
  }
}

/**
 * Safely parses and validates model JSON text, falling back to guaranteed safe structure
 */
export function parseAndValidateModelOutput<T>(
  rawText: string,
  fallbackValue: T,
  validator?: (data: any) => boolean
): { success: boolean; data: T; error?: string } {
  try {
    let cleaned = rawText.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
    }
    const parsed = JSON.parse(cleaned);
    if (validator && !validator(parsed)) {
      return {
        success: false,
        data: fallbackValue,
        error: 'Model output failed schema validation, safely reverted to deterministic fallback'
      };
    }
    return { success: true, data: parsed };
  } catch (err: any) {
    return {
      success: false,
      data: fallbackValue,
      error: `Malformed JSON from model: ${err?.message || err}`
    };
  }
}

/**
 * Mock Provider for testing malformed model output, network errors, and schema violations
 */
export class MockAIProvider implements AIProvider {
  public readonly name = 'gemini';
  private mockRawResponse?: string;
  private shouldThrowError?: boolean;

  constructor(mockRawResponse?: string, shouldThrowError = false) {
    this.mockRawResponse = mockRawResponse;
    this.shouldThrowError = shouldThrowError;
  }

  public isAvailable(): boolean {
    return true;
  }

  public async generateJSON<T>(
    _systemInstruction: string,
    _userPrompt: string,
    fallbackValue: T,
    validator?: (data: any) => boolean
  ): Promise<AIProviderResponse<T>> {
    if (this.shouldThrowError) {
      return {
        success: false,
        data: fallbackValue,
        error: 'Simulated API network failure (503 Service Unavailable)',
        provider: 'gemini',
        modelUsed: 'mock-gemini-test',
        durationMs: 1
      };
    }

    if (this.mockRawResponse !== undefined) {
      const parsed = parseAndValidateModelOutput(this.mockRawResponse, fallbackValue, validator);
      return {
        success: parsed.success,
        data: parsed.data,
        rawText: this.mockRawResponse,
        error: parsed.error,
        provider: 'gemini',
        modelUsed: 'mock-gemini-test',
        durationMs: 1
      };
    }

    return {
      success: true,
      data: fallbackValue,
      provider: 'gemini',
      modelUsed: 'mock-gemini-test',
      durationMs: 1
    };
  }
}
export class DeterministicProvider implements AIProvider {
  public readonly name = 'deterministic';

  public isAvailable(): boolean {
    return true;
  }

  public async generateJSON<T>(
    _systemInstruction: string,
    _userPrompt: string,
    fallbackValue: T
  ): Promise<AIProviderResponse<T>> {
    return {
      success: true,
      data: fallbackValue,
      provider: 'deterministic',
      modelUsed: 'deterministic-rules-engine-v1',
      durationMs: 2,
    };
  }
}

/**
 * Factory to instantiate the appropriate provider according to environment variables
 */
export function getAIProvider(): { provider: AIProvider; isFallback: boolean } {
  const configuredProvider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
  const apiKey = process.env.GEMINI_API_KEY;

  if (configuredProvider === 'deterministic' || configuredProvider === 'mock') {
    return { provider: new DeterministicProvider(), isFallback: true };
  }

  const gemini = new GeminiAIProvider(apiKey);
  if (gemini.isAvailable()) {
    return { provider: gemini, isFallback: false };
  }

  // Graceful fallback to deterministic provider when credentials missing
  return { provider: new DeterministicProvider(), isFallback: true };
}
