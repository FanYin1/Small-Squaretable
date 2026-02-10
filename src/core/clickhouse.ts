import { createClient, type ClickHouseClient } from '@clickhouse/client';
import { config } from './config';

let client: ClickHouseClient | null = null;

export function getClickHouseClient(): ClickHouseClient {
  if (!client) {
    client = createClient({
      url: config.clickhouseUrl,
      database: config.clickhouseDatabase,
    });
  }
  return client;
}

export async function closeClickHouse(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
}
