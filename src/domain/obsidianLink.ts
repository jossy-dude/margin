/** obsidian://open for a file in the synced vault (a Conflicts/ note, a dated copy, a day-plan block's note). */
export const obsidianLink = (vault: string | null | undefined, file: string) =>
  `obsidian://open?${vault ? `vault=${encodeURIComponent(vault)}&` : ''}file=${encodeURIComponent(file)}`;
