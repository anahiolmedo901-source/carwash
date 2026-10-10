import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const functionPath = join(process.cwd(), 'supabase/functions/carwash-send-push/index.ts');

describe('push notification Edge Function contract', () => {
  const source = readFileSync(functionPath, 'utf8');

  it('accepts catalog inserts and targets active clients only', () => {
    expect(source).toMatch(/'servicios'\s*\|\s*'autolavados'/);
    expect(source).toMatch(/table === 'servicios'\s*\|\|\s*table === 'autolavados'/);
    expect(source).toMatch(/operation !== 'INSERT'/);
    expect(source).toMatch(/\.from\('usuarios'\)/);
    expect(source).toMatch(/\.eq\('rol',\s*'cliente'\)/);
    expect(source).toMatch(/\.eq\('activo',\s*true\)/);
    expect(source).toMatch(/\.from\('dispositivos'\)/);
    expect(source).toMatch(/\.eq\('enabled',\s*true\)/);
  });

  it('includes catalog routing data and records one notification per recipient', () => {
    expect(source).toMatch(/notificationType:\s*'new_service'/);
    expect(source).toMatch(/notificationType:\s*'new_carwash'/);
    expect(source).toMatch(/serviceId/);
    expect(source).toMatch(/autolavadoId/);
    expect(source).toMatch(/recipients\.userIds\.map/);
    expect(source).toMatch(/carwash_log_notification/);
    expect(source).toMatch(/notificacion(?:es|Id)/i);
  });

  it('sets a delivery TTL and never places service credentials in the payload', () => {
    expect(source).toContain('const PUSH_TTL_SECONDS = 60 * 60 * 24 * 7;');
    expect(source).toMatch(/ttl:\s*PUSH_TTL_SECONDS/);
    expect(source).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY[^\n]*data/);
  });
});
