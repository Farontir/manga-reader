import type { InstalledSource } from '../db';
import type { SourceMethod } from '../sources/types';

export type SourceDispatcher = (
  source: InstalledSource,
  method: SourceMethod,
  args: unknown[],
) => Promise<unknown>;

let dispatcher: SourceDispatcher | null = null;

export function registerSourceDispatcher(next: SourceDispatcher): () => void {
  dispatcher = next;
  return () => {
    if (dispatcher === next) dispatcher = null;
  };
}

export async function callSource(
  source: InstalledSource,
  method: SourceMethod,
  args: unknown[] = [],
): Promise<unknown> {
  if (!dispatcher) throw new Error('Le moteur de sources n’est pas prêt.');
  return dispatcher(source, method, args);
}
