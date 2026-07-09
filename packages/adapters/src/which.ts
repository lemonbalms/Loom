import { which } from "bun";

export async function commandExists(name: string): Promise<boolean> {
  try {
    const path = which(name);
    return Boolean(path);
  } catch {
    return false;
  }
}

export async function resolveCommand(candidates: string[]): Promise<string | null> {
  for (const c of candidates) {
    if (await commandExists(c)) return c;
  }
  return null;
}
