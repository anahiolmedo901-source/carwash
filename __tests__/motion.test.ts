import { isMoving, isValidVector, radiansToDegrees, vectorMagnitude } from '../utils/motion';

describe('motion', () => {
  it('considera quieto un teléfono apoyado (~1 g)', () => {
    expect(isMoving({ x: 0, y: 0, z: 1 })).toBe(false);
    expect(isMoving({ x: 0.02, y: -0.01, z: 0.99 })).toBe(false);
  });

  it('detecta movimiento cuando la magnitud se aleja de 1 g', () => {
    expect(isMoving({ x: 0.8, y: 0.6, z: 1.2 })).toBe(true);
  });

  it('ignora lecturas inválidas', () => {
    expect(isValidVector({ x: Number.NaN, y: 0, z: 0 })).toBe(false);
    expect(isMoving({ x: Number.NaN, y: 0, z: 0 })).toBe(false);
    expect(isValidVector(null)).toBe(false);
  });

  it('calcula magnitud y convierte rad a grados', () => {
    expect(vectorMagnitude({ x: 3, y: 4, z: 0 })).toBe(5);
    expect(radiansToDegrees(Math.PI)).toBeCloseTo(180, 5);
  });
});
