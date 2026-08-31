export const GEMINI_FLASH_INPUT_PER_TOKEN = 0.75 / 1_000_000;
export const GEMINI_FLASH_OUTPUT_PER_TOKEN = 3.75 / 1_000_000;

export const CLAUDE_SONNET_INPUT_PER_TOKEN = 3 / 1_000_000;
export const CLAUDE_SONNET_OUTPUT_PER_TOKEN = 15 / 1_000_000;

export const RENDER_COST_PER_MS = 0.0000000356;

export const STORAGE_COST_PER_GB_MONTH = 0.021;
export const EGRESS_COST_PER_GB = 0.09;
const ASSUMED_DOWNLOADS_PER_VIDEO = 1;

export function estimateGeminiCost(inputTokens: number, outputTokens: number): number {
  return (
    inputTokens * GEMINI_FLASH_INPUT_PER_TOKEN + outputTokens * GEMINI_FLASH_OUTPUT_PER_TOKEN
  );
}

export function estimateClaudeCost(inputTokens: number, outputTokens: number): number {
  return (
    inputTokens * CLAUDE_SONNET_INPUT_PER_TOKEN + outputTokens * CLAUDE_SONNET_OUTPUT_PER_TOKEN
  );
}

export function estimateRenderCost(durationMs: number): number {
  return durationMs * RENDER_COST_PER_MS;
}

export function estimateStorageAndEgressCost(bytes: number): {
  storageCost: number;
  egressCost: number;
} {
  const gb = bytes / 1024 / 1024 / 1024;
  return {
    storageCost: gb * STORAGE_COST_PER_GB_MONTH,
    egressCost: gb * EGRESS_COST_PER_GB * ASSUMED_DOWNLOADS_PER_VIDEO,
  };
}
