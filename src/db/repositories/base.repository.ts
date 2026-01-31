import type { Database } from '../index';

export abstract class BaseRepository {
  constructor(protected db: Database) {}
}
