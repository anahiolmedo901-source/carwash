import { resolveAutolavadoImage } from '../utils/autolavadoImage';

describe('resolveAutolavadoImage', () => {
  it('usa la URL remota cuando existe', () => {
    expect(resolveAutolavadoImage('https://example.com/a.jpg', 'x')).toEqual({ uri: 'https://example.com/a.jpg' });
  });

  it('usa la imagen local indicada con local:', () => {
    const a = resolveAutolavadoImage('local:lavado-2', 'x');
    const b = resolveAutolavadoImage('LOCAL:lavado-2', 'otro');
    expect(a).toBeDefined();
    expect(a).toBe(b);
  });

  it('asigna una imagen de ejemplo estable cuando no hay imagen', () => {
    const first = resolveAutolavadoImage('', 'wash-1');
    expect(first).toBeDefined();
    expect(resolveAutolavadoImage(null, 'wash-1')).toBe(first);
    expect(resolveAutolavadoImage('local:no-existe', 'wash-1')).toBe(first);
  });
});
