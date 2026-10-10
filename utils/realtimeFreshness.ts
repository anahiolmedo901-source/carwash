export function isAtLeastAsFresh(incoming: string, current: string | null | undefined): boolean {
  const incomingTime = Date.parse(incoming);
  if (!Number.isFinite(incomingTime)) {
    return false;
  }
  if (!current) {
    return true;
  }

  const currentTime = Date.parse(current);
  if (!Number.isFinite(currentTime)) {
    return true;
  }
  return incomingTime >= currentTime;
}
