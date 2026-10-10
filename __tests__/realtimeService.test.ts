import { createRealtimeService, reservationTopic, spaceTopic } from '../services/realtimeService';
import type { AuthServiceStorage } from '../services/authService';
import { SPACE_STATUSES } from '../types/realtime';

const SESSION_TOKEN = 'a'.repeat(64);

type FakeChannel = {
  topic: string;
  listener?: (message: unknown) => void;
  statusListener?: (status: string, error?: unknown) => void;
  on: jest.Mock;
  subscribe: jest.Mock;
};

function createStorage(token: string | null = SESSION_TOKEN): AuthServiceStorage {
  return {
    getItem: jest.fn(async () => token),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  };
}

function createRealtimeClient() {
  const channels: FakeChannel[] = [];
  const realtime = {
    setAuth: jest.fn().mockResolvedValue(undefined),
    channel: jest.fn((topic: string) => {
      const channel: FakeChannel = {
        topic,
        on: jest.fn((_type: string, _filter: unknown, listener: (message: unknown) => void) => {
          channel.listener = listener;
          return channel;
        }),
        subscribe: jest.fn((listener: (status: string, error?: unknown) => void) => {
          channel.statusListener = listener;
          return channel;
        }),
      };
      channels.push(channel);
      return channel;
    }),
    removeChannel: jest.fn().mockResolvedValue('ok'),
  };

  return {
    client: {
      functions: {
        invoke: jest.fn().mockResolvedValue({ data: { token: 'realtime-jwt' }, error: null }),
      },
      realtime,
    },
    channels,
  };
}

async function settleAsyncSetup(): Promise<void> {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
}

describe('Realtime subscription service', () => {
  it('generates the stable customer and autolavado topics', () => {
    expect(SPACE_STATUSES).toEqual(['disponible', 'reservado', 'ocupado', 'mantenimiento']);
    expect(reservationTopic('customer-1')).toBe('carwash:reservaciones:customer:customer-1');
    expect(spaceTopic('wash-1')).toBe('carwash:espacios_lavado:autolavado:wash-1');
    expect(() => reservationTopic('')).toThrow('customer id');
    expect(() => spaceTopic('  ')).toThrow('autolavado id');
  });

  it('shares one private channel and token setup between duplicate subscribers', async () => {
    const { client, channels } = createRealtimeClient();
    const service = createRealtimeService(createStorage(), client as never);
    const first = jest.fn();
    const second = jest.fn();

    const unsubscribeFirst = service.subscribeToCustomerReservations('customer-1', first);
    const unsubscribeSecond = service.subscribeToCustomerReservations('customer-1', second);
    await settleAsyncSetup();

    expect(client.functions.invoke).toHaveBeenCalledTimes(1);
    expect(client.realtime.setAuth).toHaveBeenCalledWith('realtime-jwt');
    expect(client.realtime.channel).toHaveBeenCalledTimes(1);
    expect(client.realtime.channel).toHaveBeenCalledWith(
      'carwash:reservaciones:customer:customer-1',
      { config: { private: true } },
    );

    channels[0].statusListener?.('SUBSCRIBED');
    channels[0].listener?.({
      payload: { id: 'reservation-1', status: 'en_lavado', updated_at: '2026-10-05T12:00:00.000Z' },
    });
    expect(first).toHaveBeenCalledWith({ entityId: 'reservation-1', status: 'en_lavado', updatedAt: '2026-10-05T12:00:00.000Z' });
    expect(second).toHaveBeenCalledWith({ entityId: 'reservation-1', status: 'en_lavado', updatedAt: '2026-10-05T12:00:00.000Z' });

    unsubscribeFirst();
    expect(client.realtime.removeChannel).not.toHaveBeenCalled();
    channels[0].listener?.({
      payload: { id: 'reservation-1', status: 'finalizada', updated_at: '2026-10-05T13:00:00.000Z' },
    });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);

    unsubscribeSecond();
    expect(client.realtime.removeChannel).toHaveBeenCalledTimes(1);
    expect(client.realtime.removeChannel).toHaveBeenCalledWith(channels[0]);
  });

  it('reports channel authorization errors without throwing or fabricating a status', async () => {
    const { client, channels } = createRealtimeClient();
    const service = createRealtimeService(createStorage(), client as never);
    const listener = jest.fn();
    const onError = jest.fn();

    service.subscribeToCustomerReservations('customer-1', listener, onError);
    await settleAsyncSetup();

    const channelError = new Error('private channel denied');
    channels[0].statusListener?.('CHANNEL_ERROR', channelError);
    channels[0].listener?.({
      payload: { id: 'reservation-1', status: 'unknown-status', updated_at: '2026-10-05T12:00:00.000Z' },
    });

    expect(onError).toHaveBeenCalledWith(channelError);
    expect(listener).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('status') }));
  });

  it('uses one global auth request shape with a monotonically broadened scope union', async () => {
    const { client, channels } = createRealtimeClient();
    const service = createRealtimeService(createStorage(), client as never);
    const customerUnsubscribe = service.subscribeToCustomerReservations('customer-1', jest.fn());
    const firstSpaceUnsubscribe = service.subscribeToSpaceStatus('wash-1', jest.fn());
    const secondSpaceUnsubscribe = service.subscribeToSpaceStatus('wash-2', jest.fn());
    await settleAsyncSetup();

    const authBodies = client.functions.invoke.mock.calls.map(([, options]) => options.body);
    expect(authBodies.length).toBeGreaterThan(0);
    expect(authBodies).toContainEqual({ sessionToken: SESSION_TOKEN, autolavadoIds: ['wash-1', 'wash-2'] });
    expect(authBodies).not.toContainEqual({ sessionToken: SESSION_TOKEN, autolavadoId: 'wash-1' });
    expect(authBodies).not.toContainEqual({ sessionToken: SESSION_TOKEN, autolavadoId: 'wash-2' });

    const scopeSets = authBodies.map((body) => body.autolavadoIds);
    for (let index = 1; index < scopeSets.length; index += 1) {
      expect(scopeSets[index]).toEqual(expect.arrayContaining(scopeSets[index - 1]));
    }

    firstSpaceUnsubscribe();
    customerUnsubscribe();
    expect(client.functions.invoke).toHaveBeenCalledTimes(authBodies.length);

    secondSpaceUnsubscribe();
    service.subscribeToSpaceStatus('wash-3', jest.fn());
    await settleAsyncSetup();
    expect(client.functions.invoke).toHaveBeenLastCalledWith('carwash-realtime-token', {
      body: { sessionToken: SESSION_TOKEN, autolavadoIds: ['wash-3'] },
    });
    expect(client.realtime.setAuth).toHaveBeenCalled();
    expect(channels.length).toBeGreaterThanOrEqual(3);
  });

  it('validates space payloads while using the shared JWT request contract', async () => {
    const { client, channels } = createRealtimeClient();
    const service = createRealtimeService(createStorage(), client as never);
    const listener = jest.fn();

    service.subscribeToSpaceStatus('wash-1', listener);
    await settleAsyncSetup();

    expect(client.functions.invoke).toHaveBeenCalledWith('carwash-realtime-token', {
      body: { sessionToken: SESSION_TOKEN, autolavadoIds: ['wash-1'] },
    });
    channels[0].listener?.({
      payload: { id: 'space-1', status: 'mantenimiento', updated_at: '2026-10-05T12:00:00.000Z' },
    });

    expect(listener).toHaveBeenCalledWith({
      entityId: 'space-1',
      status: 'mantenimiento',
      updatedAt: '2026-10-05T12:00:00.000Z',
    });
  });

  it('reports token failures through the non-fatal error callback', async () => {
    const { client } = createRealtimeClient();
    client.functions.invoke.mockResolvedValueOnce({ data: null, error: { message: 'token unavailable' } });
    const service = createRealtimeService(createStorage(), client as never);
    const onError = jest.fn();

    service.subscribeToCustomerReservations('customer-1', jest.fn(), onError);
    await settleAsyncSetup();

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'token unavailable' }));
    expect(client.realtime.channel).not.toHaveBeenCalled();
  });
});
