import { startMotionSensor } from '../services/motionService';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
jest.mock('expo-sensors', () => {
  const makeSensor = () => ({
    isAvailableAsync: jest.fn(),
    setUpdateInterval: jest.fn(),
    addListener: jest.fn(),
  });
  return { Accelerometer: makeSensor(), Gyroscope: makeSensor() };
}, { virtual: true });

type MockSensor = { isAvailableAsync: jest.Mock; setUpdateInterval: jest.Mock; addListener: jest.Mock };
const mockSensors = jest.requireMock('expo-sensors') as { Accelerometer: MockSensor; Gyroscope: MockSensor };
const remove = jest.fn();

describe('motionService', () => {
  beforeEach(() => {
    remove.mockReset();
    Object.values(mockSensors).forEach((sensor) => {
      sensor.isAvailableAsync.mockReset();
      sensor.setUpdateInterval.mockReset();
      sensor.addListener.mockReset().mockReturnValue({ remove });
    });
  });

  it('entrega lecturas válidas y descarta inválidas', async () => {
    mockSensors.Accelerometer.isAvailableAsync.mockResolvedValue(true);
    const onData = jest.fn();
    const handle = startMotionSensor('accelerometer', { onData, onUnavailable: jest.fn(), onError: jest.fn() });
    await flush();
    const listener = mockSensors.Accelerometer.addListener.mock.calls[0][0];
    listener({ x: 0, y: 0, z: 1 });
    listener({ x: Number.NaN, y: 0, z: 1 });
    expect(onData).toHaveBeenCalledTimes(1);
    handle.stop();
    expect(remove).toHaveBeenCalled();
  });

  it('avisa cuando el sensor no está disponible', async () => {
    mockSensors.Gyroscope.isAvailableAsync.mockResolvedValue(false);
    const onUnavailable = jest.fn();
    startMotionSensor('gyroscope', { onData: jest.fn(), onUnavailable, onError: jest.fn() });
    await flush();
    expect(onUnavailable).toHaveBeenCalledWith(expect.stringContaining('giroscopio'));
    expect(mockSensors.Gyroscope.addListener).not.toHaveBeenCalled();
  });

  it('avisa error si el sensor falla', async () => {
    mockSensors.Accelerometer.isAvailableAsync.mockRejectedValue(new Error('x'));
    const onError = jest.fn();
    startMotionSensor('accelerometer', { onData: jest.fn(), onUnavailable: jest.fn(), onError });
    await flush();
    expect(onError).toHaveBeenCalled();
  });

  it('no se suscribe si se detiene antes de resolver la disponibilidad', async () => {
    mockSensors.Accelerometer.isAvailableAsync.mockResolvedValue(true);
    const handle = startMotionSensor('accelerometer', { onData: jest.fn(), onUnavailable: jest.fn(), onError: jest.fn() });
    handle.stop();
    await flush();
    expect(mockSensors.Accelerometer.addListener).not.toHaveBeenCalled();
  });
});
