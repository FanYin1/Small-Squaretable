import { AppError } from '../../core/errors';

function configuredInteger(name: string, fallback: number, min: number, max: number): number {
  if (process.env[name] === undefined) return fallback;
  const value = Number(process.env[name]);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new AppError(`Invalid world book setting: ${name}`, 500, 'WORLD_INFO_CONFIG_INVALID');
  }
  return value;
}

export function worldInfoScanDefaults() {
  return {
    version: 2 as const,
    scanMessageCount: configuredInteger('WORLD_INFO_SCAN_MESSAGE_COUNT', 10, 1, 1000),
    maxRecursionDepth: configuredInteger('WORLD_INFO_MAX_RECURSION_DEPTH', 3, 1, 10),
    tokenBudget: configuredInteger('WORLD_INFO_TOKEN_BUDGET', 2048, 1, 100000),
  };
}
