import { describe, it, expect } from 'vitest';
import { db } from './index';
import { sql } from 'drizzle-orm';

describe('Database Connection', () => {
  it('should connect to database successfully', async () => {
    const result = await db.execute(sql`SELECT 1 as value`);
    expect(result[0].value).toBe(1);
  });

  it('should have schema exported', () => {
    expect(db).toBeDefined();
    expect(db.query).toBeDefined();
  });
});
