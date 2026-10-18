import type { Database } from '../index';

/** drizzle 事务回调里拿到的 tx 对象类型 */
export type DbTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * 能执行查询的对象：普通连接或事务。
 * repository 的写方法接受它作为可选参数，调用方想让多次写入落在同一个事务里时传 tx。
 */
export type DbExecutor = Database | DbTransaction;

export abstract class BaseRepository {
  constructor(protected db: Database) {}
}
