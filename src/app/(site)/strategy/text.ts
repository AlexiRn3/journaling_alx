// Strategy texts the owner has not written yet are stored as "[What to write here.]".
// They are shown as they are, in the pencil colour, so they read as placeholders.

export function isPlaceholder(text: string): boolean {
  return /^\s*\[[\s\S]*\]\s*$/.test(text);
}
