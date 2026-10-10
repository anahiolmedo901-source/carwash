import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { SESSION_TOKEN_STORAGE_KEY, type AuthServiceStorage } from './authService';
import {
  parseReservationStatusUpdate,
  parseSpaceStatusUpdate,
  RESERVATION_BROADCAST_EVENT,
  SPACE_BROADCAST_EVENT,
  type ReservationStatusUpdate,
  type SpaceStatusUpdate,
} from '../types/realtime';

export type RealtimeErrorHandler = (error: Error) => void;

export interface RealtimeChannelLike {
  on(
    type: 'broadcast',
    filter: { event: string },
    callback: (message: unknown) => void,
  ): RealtimeChannelLike;
  subscribe(callback?: (status: string, error?: unknown) => void): RealtimeChannelLike;
}

export interface RealtimeClientLike {
  functions: {
    invoke(
      functionName: string,
      options: { body: Record<string, unknown> },
    ): Promise<{ data: unknown; error: unknown | null }>;
  };
  realtime: {
    setAuth(accessToken: string): Promise<unknown> | unknown;
    channel(topic: string, options: { config: { private: boolean } }): RealtimeChannelLike;
    removeChannel(channel: RealtimeChannelLike): Promise<unknown> | unknown;
  };
}

export interface RealtimeService {
  subscribeToCustomerReservations(
    customerId: string,
    listener: (update: ReservationStatusUpdate) => void,
    onError?: RealtimeErrorHandler,
  ): () => void;
  subscribeToSpaceStatus(
    autolavadoId: string,
    listener: (update: SpaceStatusUpdate) => void,
    onError?: RealtimeErrorHandler,
  ): () => void;
}

interface ChannelListener {
  onUpdate: (payload: unknown) => void;
  onError?: RealtimeErrorHandler;
}

interface ChannelEntry {
  topic: string;
  event: string;
  tokenScope: string | null;
  channel: RealtimeChannelLike | null;
  listeners: Map<number, ChannelListener>;
  closed: boolean;
}

const realtimeClient = supabase as unknown as RealtimeClientLike;

function requireIdentifier(value: string, field: string): string {
  const identifier = value.trim();
  if (!identifier) {
    throw new Error(`Realtime ${field} is required.`);
  }
  if (identifier.includes(':')) {
    throw new Error(`Realtime ${field} contains an invalid character.`);
  }
  return identifier;
}

export function reservationTopic(customerId: string): string {
  return `carwash:reservaciones:customer:${requireIdentifier(customerId, 'customer id')}`;
}

export function spaceTopic(autolavadoId: string): string {
  return `carwash:espacios_lavado:autolavado:${requireIdentifier(autolavadoId, 'autolavado id')}`;
}

function errorFromUnknown(error: unknown, fallback: string): Error {
  if (error instanceof Error && error.message) {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return new Error(error.message);
  }
  return new Error(fallback);
}

function errorFromChannelStatus(status: string, error: unknown): Error {
  return errorFromUnknown(error, `Realtime channel ${status.toLowerCase()}.`);
}

function messagePayload(message: unknown): unknown {
  if (message && typeof message === 'object' && !Array.isArray(message) && 'payload' in message) {
    return (message as { payload: unknown }).payload;
  }
  return message;
}

export function createRealtimeService(
  storage: AuthServiceStorage = AsyncStorage,
  client: RealtimeClientLike = realtimeClient,
): RealtimeService {
  const entries = new Map<string, ChannelEntry>();
  const scopeUnion = new Set<string>();
  let authenticatedScopes: Set<string> | null = null;
  let tokenPromise: Promise<void> | null = null;
  let tokenPromiseGeneration: number | null = null;
  let authGeneration = 0;
  let nextListenerId = 1;

  function notifyError(entry: ChannelEntry, error: Error): void {
    if (entry.closed) {
      return;
    }
    for (const listener of entry.listeners.values()) {
      listener.onError?.(error);
    }
  }

  async function authenticate(): Promise<void> {
    while (entries.size > 0) {
      const requestedScopes = [...scopeUnion].sort();
      if (authenticatedScopes && requestedScopes.every((scope) => authenticatedScopes?.has(scope))) {
        return;
      }

      const existing = tokenPromise;
      if (existing) {
        const existingGeneration = tokenPromiseGeneration;
        try {
          await existing;
        } catch (error) {
          if (existingGeneration === authGeneration) {
            throw error;
          }
        }
        continue;
      }

      const generation = authGeneration;
      const promise = (async () => {
        const sessionToken = await storage.getItem(SESSION_TOKEN_STORAGE_KEY);
        if (!sessionToken) {
          throw new Error('Your session has expired. Sign in again.');
        }

        const body: Record<string, unknown> = {
          sessionToken,
          autolavadoIds: requestedScopes,
        };
        const { data, error } = await client.functions.invoke('carwash-realtime-token', { body });
        if (error) {
          throw errorFromUnknown(error, 'Realtime authorization is unavailable.');
        }
        if (!data || typeof data !== 'object' || !('token' in data) || typeof data.token !== 'string' || !data.token) {
          throw new Error('Realtime authorization returned an invalid token.');
        }
        await client.realtime.setAuth(data.token);
        if (generation === authGeneration && entries.size > 0) {
          authenticatedScopes = new Set(requestedScopes);
        }
      })();

      tokenPromise = promise;
      tokenPromiseGeneration = generation;
      try {
        await promise;
      } finally {
        if (tokenPromise === promise) {
          tokenPromise = null;
          tokenPromiseGeneration = null;
        }
      }
    }
  }

  function removeEntry(entry: ChannelEntry): void {
    if (entry.closed) {
      return;
    }
    entry.closed = true;
    entries.delete(entry.topic);
    if (entry.channel) {
      void Promise.resolve(client.realtime.removeChannel(entry.channel)).catch(() => undefined);
    }
    if (entries.size === 0) {
      scopeUnion.clear();
      authenticatedScopes = null;
      authGeneration += 1;
    }
  }

  function startEntry(entry: ChannelEntry, parser: (payload: unknown) => unknown): void {
    void Promise.resolve().then(async () => {
      if (entry.closed || entry.listeners.size === 0) {
        return;
      }
      try {
        await authenticate();
        if (entry.closed || entry.listeners.size === 0) {
          return;
        }
        const channel = client.realtime.channel(entry.topic, { config: { private: true } });
        entry.channel = channel;
        channel.on('broadcast', { event: entry.event }, (message) => {
          if (entry.closed) {
            return;
          }
          try {
            const parsed = parser(messagePayload(message));
            for (const listener of entry.listeners.values()) {
              listener.onUpdate(parsed);
            }
          } catch (error) {
            notifyError(entry, errorFromUnknown(error, 'Realtime payload is invalid.'));
          }
        });
        channel.subscribe((status, error) => {
          if (status !== 'SUBSCRIBED') {
            notifyError(entry, errorFromChannelStatus(status, error));
          }
        });
      } catch (error) {
        notifyError(entry, errorFromUnknown(error, 'Realtime subscription is unavailable.'));
      }
    });
  }

  function subscribe<T>(
    topic: string,
    event: string,
    tokenScope: string | null,
    parser: (payload: unknown) => T,
    onUpdate: (update: T) => void,
    onError?: RealtimeErrorHandler,
  ): () => void {
    let entry = entries.get(topic);
    if (!entry) {
      entry = {
        topic,
        event,
        tokenScope,
        channel: null,
        listeners: new Map(),
        closed: false,
      };
      entries.set(topic, entry);
      if (tokenScope) {
        scopeUnion.add(tokenScope);
      }
      startEntry(entry, parser);
    }

    const listenerId = nextListenerId;
    nextListenerId += 1;
    entry.listeners.set(listenerId, { onUpdate: (payload) => onUpdate(payload as T), onError });
    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      entry?.listeners.delete(listenerId);
      if (entry && entry.listeners.size === 0) {
        removeEntry(entry);
      }
    };
  }

  return {
    subscribeToCustomerReservations(customerId, listener, onError) {
      const topic = reservationTopic(customerId);
      return subscribe(
        topic,
        RESERVATION_BROADCAST_EVENT,
        null,
        parseReservationStatusUpdate,
        listener,
        onError,
      );
    },

    subscribeToSpaceStatus(autolavadoId, listener, onError) {
      const scope = requireIdentifier(autolavadoId, 'autolavado id');
      return subscribe(
        spaceTopic(scope),
        SPACE_BROADCAST_EVENT,
        scope,
        parseSpaceStatusUpdate,
        listener,
        onError,
      );
    },
  };
}

export const realtimeService = createRealtimeService();
