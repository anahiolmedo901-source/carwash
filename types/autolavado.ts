export type ExplorationTableName =
  | 'vista_autolavados'
  | 'autolavados'
  | 'servicios'
  | 'espacios_lavado';

export type { SpaceStatus } from './realtime';

/**
 * The remote schema is not present in this repository. Raw rows therefore stay
 * untyped at the transport edge and are normalized by the exploration service.
 */
export type ExplorationRawRow = Record<string, unknown>;

export type VistaAutolavadoRow = ExplorationRawRow;
export type AutolavadoRow = ExplorationRawRow;
export type ServicioRow = ExplorationRawRow;
export type EspacioLavadoRow = ExplorationRawRow;

export interface ExplorationQueryResponse {
  data: ExplorationRawRow[] | null;
  error: unknown | null;
}

/**
 * Read-only query surface used by the service and its injected Jest fakes.
 * It intentionally exposes no insert, update, upsert, or delete operations.
 */
export interface ExplorationQueryBuilder {
  select(columns: '*'): PromiseLike<ExplorationQueryResponse>;
}

export interface ExplorationQueryClient {
  from(table: ExplorationTableName): ExplorationQueryBuilder;
}

export interface AutolavadoListItem {
  id: string;
  name: string;
  imageUrl: string;
  address: string;
  hours: string;
  rating: number;
  reviewCount: number;
}

export interface Servicio {
  id: string;
  autolavadoId: string;
  name: string;
  description: string;
  price: number;
  approximateDurationMinutes: number;
}

export interface EspacioLavado {
  id: string | null;
  autolavadoId: string | null;
  name: string | null;
  status: string | null;
  active: boolean | null;
}

export interface AutolavadoDetail {
  id: string;
  name: string;
  imageUrl: string;
  description: string;
  address: string;
  hours: string;
  rating: number;
  reviewCount: number | null;
  services: Servicio[];
  spaces: EspacioLavado[];
}

export interface AutolavadoService {
  listAutolavados(): Promise<AutolavadoListItem[]>;
  getAutolavado(id: string): Promise<AutolavadoDetail | null>;
}
