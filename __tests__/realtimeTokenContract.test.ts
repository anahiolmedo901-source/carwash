import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const functionPath = join(process.cwd(), 'supabase/functions/carwash-realtime-token/index.ts');

describe('Realtime token Edge Function contract', () => {
  const source = readFileSync(functionPath, 'utf8');

  it('uses the Deno boundary, validates the opaque session through the existing RPC, and never exposes row data', () => {
    expect(source).toMatch(/Deno\.serve\s*\(/);
    expect(source).toMatch(/npm:@supabase\/supabase-js@2/);
    expect(source).toMatch(/carwash_current_user_id/);
    expect(source).toMatch(/p_session_token/);
    expect(source).toMatch(/sessionToken/);
    expect(source).toMatch(/autolavadoIds/);
    expect(source).toMatch(/from\(['"]autolavados['"]\)/);
    expect(source).toMatch(/\.in\(['"]id['"],\s*autolavadoIds\)/);
    expect(source).not.toMatch(/console\.(log|info|debug).*session/i);
    expect(source).not.toMatch(/return\s+json\(\{[^}]*sessionToken/i);
  });

  it('signs a short-lived server-side JWT with only realtime scope claims', () => {
    expect(source).toMatch(/npm:jose@/);
    expect(source).toMatch(/new\s+SignJWT\s*\(/);
    expect(source).toMatch(/SUPABASE_JWT_SECRET/);
    expect(source).toMatch(/role\s*:\s*['"]authenticated['"]/);
    expect(source).toMatch(/sub\s*:/);
    expect(source).toMatch(/autolavado_ids\s*:/);
    expect(source).toMatch(/MAX_AUTOLAVADO_IDS|maximum.*autolavado/i);
    expect(source).toMatch(/setExpirationTime\s*\(/);
    expect(source).toMatch(/300/);
    expect(source).toMatch(/return\s+json\(\{\s*token\s*\}/);
    expect(source).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"][^'"]+['"]/);
    expect(source).not.toMatch(/SUPABASE_JWT_SECRET\s*=\s*['"][^'"]+['"]/);
  });

  it('handles CORS, malformed requests, and server errors without leaking authentication details', () => {
    expect(source).toMatch(/Access-Control-Allow-Origin/);
    expect(source).toMatch(/OPTIONS/);
    expect(source).toMatch(/method\s*!==\s*['"]POST['"]/);
    expect(source).toMatch(/try\s*\{[\s\S]*request\.json\(\)/);
    expect(source).toMatch(/\},\s*400\)/);
    expect(source).toMatch(/\},\s*401\)/);
    expect(source).toMatch(/\},\s*500\)/);
    expect(source).not.toMatch(/Invalid session token:/i);
  });

  it('rejects null and non-object JSON bodies before reading request fields', () => {
    expect(source).toMatch(/const parsedBody:\s*unknown\s*=\s*await request\.json\(\)/i);
    expect(source).toMatch(/parsedBody\s*===\s*null/i);
    expect(source).toMatch(/typeof parsedBody\s*!==\s*['"]object['"]/i);
    expect(source).toMatch(/Array\.isArray\(parsedBody\)/i);
    expect(source).toMatch(/return json\(\{\s*error:\s*['"]Invalid request\.['"]\s*\},\s*400\)/i);
    expect(source).toMatch(/body\s*=\s*parsedBody\s+as\s+TokenRequest/i);
  });
});
