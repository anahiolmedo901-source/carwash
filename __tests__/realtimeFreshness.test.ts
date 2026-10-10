import { isAtLeastAsFresh } from '../utils/realtimeFreshness';

describe('Realtime freshness comparison', () => {
  it('accepts equal and newer valid timestamps', () => {
    expect(isAtLeastAsFresh('2026-10-05T12:00:00.000Z', '2026-10-05T12:00:00.000Z')).toBe(true);
    expect(isAtLeastAsFresh('2026-10-05T12:01:00.000Z', '2026-10-05T12:00:00.000Z')).toBe(true);
  });

  it('rejects an older or invalid incoming timestamp', () => {
    expect(isAtLeastAsFresh('2026-10-05T11:59:00.000Z', '2026-10-05T12:00:00.000Z')).toBe(false);
    expect(isAtLeastAsFresh('not-a-timestamp', '2026-10-05T12:00:00.000Z')).toBe(false);
  });
});
