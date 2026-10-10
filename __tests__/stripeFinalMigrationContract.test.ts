import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('final Stripe migration permissions', () => {
  it('keeps the mobile sandbox RPCs executable by the client roles', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/20261008000500_stripe_payments.sql'),
      'utf8',
    );

    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.carwash_begin_payment\(text, text, text\) TO anon, authenticated/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.carwash_process_sandbox_payment\(text, text, text\)[\s\S]*TO anon, authenticated/i);
  });
});
