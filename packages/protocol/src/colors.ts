/** Distinct terminal-friendly ANSI colors for peer labels. */
export const PEER_COLORS = [
  "#FF6B9D", // pink
  "#4ECDC4", // teal
  "#FFE66D", // yellow
  "#95E1D3", // mint
  "#F38181", // coral
  "#AA96DA", // purple
  "#FCBAD3", // light pink
  "#A8D8EA", // sky
  "#FF9A76", // orange
  "#61C0BF", // cyan
] as const;

export function colorForPeer(index: number): string {
  return PEER_COLORS[index % PEER_COLORS.length]!;
}

/** Map hex color to approximate ANSI 256 or truecolor escape. */
export function ansiFg(hex: string, text: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return text;
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
}
