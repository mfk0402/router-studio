/** Set before `updates.check()` when the user explicitly asked (menu, palette, settings). */
let userInitiatedUpdateCheck = false;

export function markUserInitiatedUpdateCheck(): void {
  userInitiatedUpdateCheck = true;
}

/** If the last check was user-initiated, clears the flag and returns true. */
export function consumeUserInitiatedUpdateCheck(): boolean {
  const v = userInitiatedUpdateCheck;
  userInitiatedUpdateCheck = false;
  return v;
}
