import { supabase } from '../lib/supabase';
import type {
  AutolavadoDetail,
  AutolavadoListItem,
  AutolavadoService,
  ExplorationQueryClient,
  ExplorationRawRow,
  ExplorationTableName,
  EspacioLavado,
  Servicio,
} from '../types/autolavado';
import { RESERVATION_HOURS_LABEL } from '../utils/reservationSchedule';

const AUTOLAVADO_ID_ALIASES = ['id', 'autolavado_id', 'id_autolavado', 'carwash_id'];
const SERVICE_ID_ALIASES = ['id', 'servicio_id', 'id_servicio'];
const SPACE_ID_ALIASES = ['id', 'espacio_id', 'id_espacio'];
const AUTOLAVADO_ASSOCIATION_ALIASES = [
  'autolavado_id',
  'id_autolavado',
  'carwash_id',
  'wash_id',
  'lavado_id',
];

export class AutolavadoSchemaError extends Error {
  constructor(message: string) {
    super(`Autolavado schema contract error: ${message}`);
    this.name = 'AutolavadoSchemaError';
  }
}

function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'unknown read failure';
}

async function readRows(client: ExplorationQueryClient, table: ExplorationTableName): Promise<ExplorationRawRow[]> {
  const { data, error } = await client.from(table).select('*');
  if (error) {
    throw new Error(`Failed to read ${table}: ${getErrorMessage(error)}`);
  }
  if (data === null) {
    return [];
  }
  if (!Array.isArray(data) || data.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
    throw new AutolavadoSchemaError(`expected ${table} to return object rows`);
  }
  return data;
}

function rawValue(row: ExplorationRawRow, aliases: string[]): unknown {
  for (const alias of aliases) {
    const value = row[alias];
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
}

function optionalIdentifier(row: ExplorationRawRow, aliases: string[]): string | null {
  const value = rawValue(row, aliases);
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function requiredIdentifier(row: ExplorationRawRow, aliases: string[], field: string): string {
  const value = optionalIdentifier(row, aliases);
  if (!value) {
    throw new AutolavadoSchemaError(`missing required ${field}`);
  }
  return value;
}

function optionalText(row: ExplorationRawRow, aliases: string[]): string | null {
  const value = rawValue(row, aliases);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalBoolean(row: ExplorationRawRow, aliases: string[]): boolean | null {
  const value = rawValue(row, aliases);
  return typeof value === 'boolean' ? value : null;
}

function requiredText(row: ExplorationRawRow, aliases: string[], field: string): string {
  const value = optionalText(row, aliases);
  if (!value) {
    throw new AutolavadoSchemaError(`missing required ${field}`);
  }
  return value;
}

function optionalNumber(row: ExplorationRawRow, aliases: string[]): number | null {
  const value = rawValue(row, aliases);
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function requiredNumber(row: ExplorationRawRow, aliases: string[], field: string): number {
  const value = optionalNumber(row, aliases);
  if (value === null) {
    throw new AutolavadoSchemaError(`missing required ${field}`);
  }
  return value;
}

function optionalReviewCount(row: ExplorationRawRow): number | null {
  const value = optionalNumber(row, [
    'cantidad_resenas',
    'numero_resenas',
    'total_resenas',
    'resenas_count',
    'review_count',
    'reviews_count',
  ]);
  if (value === null) {
    return null;
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new AutolavadoSchemaError('review count must be a non-negative integer');
  }
  return value;
}

function requiredDuration(row: ExplorationRawRow): number {
  const raw = rawValue(row, [
    'duracion_aproximada',
    'duracion',
    'tiempo_aproximado',
    'estimated_duration',
    'duration',
    'duration_minutes',
    'duracion_minutos',
  ]);
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  if (typeof raw === 'string' && raw.trim()) {
    const normalized = raw.trim().replace(',', '.');
    const match = normalized.match(/^(\d+(?:\.\d+)?)\s*(?:min|mins|minuto|minutos)?$/i);
    if (match) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }
  throw new AutolavadoSchemaError('missing required approximate duration');
}

function isInactive(row: ExplorationRawRow): boolean {
  return optionalBoolean(row, ['activo', 'active']) === false;
}

/**
 * Mapeo tolerante: solo exige identidad y nombre. Los demás datos de
 * presentación usan valores por defecto para que una fila incompleta no
 * oculte todos los autolavados.
 */
function mapListItem(row: ExplorationRawRow): AutolavadoListItem | null {
  const id = optionalIdentifier(row, AUTOLAVADO_ID_ALIASES);
  const name = optionalText(row, ['nombre', 'name', 'titulo', 'title']);
  if (!id || !name || isInactive(row)) {
    return null;
  }
  return {
    id,
    name,
    imageUrl: optionalText(row, ['imagen_url', 'image_url', 'foto_url', 'imagen', 'image', 'foto']) ?? '',
    address: optionalText(row, ['direccion', 'address', 'domicilio']) ?? 'Dirección no disponible',
    hours: RESERVATION_HOURS_LABEL,
    rating: (() => {
      const value = optionalNumber(row, ['calificacion', 'rating', 'promedio_calificacion', 'average_rating', 'puntuacion']);
      return value !== null && value >= 0 && value <= 5 ? value : 0;
    })(),
    reviewCount: (() => {
      const value = optionalNumber(row, ['cantidad_resenas', 'numero_resenas', 'total_resenas', 'resenas_count', 'review_count', 'reviews_count']);
      return value !== null && Number.isInteger(value) && value >= 0 ? value : 0;
    })(),
  };
}

function mapDetailBase(row: ExplorationRawRow): Omit<AutolavadoDetail, 'services' | 'spaces'> {
  const base = mapListItem(row);
  if (!base) {
    throw new AutolavadoSchemaError('missing required name');
  }
  return {
    id: base.id,
    name: base.name,
    imageUrl: base.imageUrl,
    description: optionalText(row, ['descripcion', 'description', 'detalle', 'summary']) ?? '',
    address: base.address,
    hours: base.hours,
    rating: base.rating,
    reviewCount: optionalReviewCount(row),
  };
}

function mapSpace(row: ExplorationRawRow): EspacioLavado {
  return {
    id: optionalIdentifier(row, SPACE_ID_ALIASES),
    autolavadoId: optionalIdentifier(row, AUTOLAVADO_ASSOCIATION_ALIASES),
    name: optionalText(row, ['nombre', 'name']),
    status: optionalText(row, ['estado', 'status']),
    active: optionalBoolean(row, ['activo', 'active']),
  };
}

function mapServices(
  rows: ExplorationRawRow[],
  autolavadoId: string,
): Servicio[] {
  if (rows.length === 0) {
    return [];
  }

  const hasAssociationSource = rows.some((row) => optionalIdentifier(row, AUTOLAVADO_ASSOCIATION_ALIASES));
  if (!hasAssociationSource) {
    throw new AutolavadoSchemaError('missing service association');
  }

  const services: Servicio[] = [];
  for (const row of rows) {
    const serviceId = requiredIdentifier(row, SERVICE_ID_ALIASES, 'service identity');
    const directAutolavadoId = optionalIdentifier(row, AUTOLAVADO_ASSOCIATION_ALIASES);

    if (directAutolavadoId !== null && directAutolavadoId !== autolavadoId) {
      continue;
    }
    if (directAutolavadoId === null) {
      continue;
    }
    if (isInactive(row)) {
      continue;
    }

    const price = requiredNumber(row, ['precio', 'price', 'costo', 'cost', 'importe'], 'price');
    if (price < 0) {
      throw new AutolavadoSchemaError('price must be non-negative');
    }
    services.push({
      id: serviceId,
      autolavadoId,
      name: requiredText(row, ['nombre', 'name', 'titulo', 'title'], 'service name'),
      description: requiredText(row, ['descripcion', 'description', 'detalle', 'summary'], 'service description'),
      price,
      approximateDurationMinutes: requiredDuration(row),
    });
  }
  return services;
}

/**
 * The generated local Database type does not contain these four remote objects.
 * This is the only cast in the feature: the service narrows the client to the
 * read-only `from(...).select('*')` surface, then validates every raw row.
 */
const explorationClient = supabase as unknown as ExplorationQueryClient;

export function createAutolavadoService(client: ExplorationQueryClient = explorationClient): AutolavadoService {
  return {
    async listAutolavados() {
      let rows: ExplorationRawRow[] = [];
      let viewError: unknown = null;
      try {
        rows = await readRows(client, 'vista_autolavados');
      } catch (error) {
        viewError = error;
      }
      // Respaldo: si la vista falla o viene vacía, se lee la tabla autolavados.
      if (rows.length === 0) {
        try {
          rows = await readRows(client, 'autolavados');
        } catch (error) {
          throw viewError ?? error;
        }
      }
      return rows.map(mapListItem).filter((item): item is AutolavadoListItem => item !== null);
    },

    async getAutolavado(id: string) {
      if (!id.trim()) {
        throw new AutolavadoSchemaError('autolavado id is required');
      }

      const [autolavadoRows, serviceRows, spaceRows] = await Promise.all([
        readRows(client, 'autolavados'),
        readRows(client, 'servicios'),
        readRows(client, 'espacios_lavado'),
      ]);
      const autolavados = autolavadoRows.map((row) => ({
        row,
        id: requiredIdentifier(row, AUTOLAVADO_ID_ALIASES, 'autolavado identity'),
      }));
      const selected = autolavados.find((entry) => entry.id === id);
      if (!selected) {
        return null;
      }

      const spaces = spaceRows
        .map(mapSpace)
        .filter((space) => space.autolavadoId === id);
      return {
        ...mapDetailBase(selected.row),
        services: mapServices(serviceRows, id),
        spaces,
      };
    },
  };
}

export const autolavadoService = createAutolavadoService();
