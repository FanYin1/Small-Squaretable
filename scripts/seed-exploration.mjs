import postgres from 'postgres';
if (process.env.EXPLORATION_CANDIDATE !== '1') throw new Error('Only the isolated exploration candidate may be seeded');
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const examples = JSON.parse(Buffer.concat(chunks).toString('utf8'));
if (!Array.isArray(examples) || examples.length !== 2) throw new Error('Expected two original acceptance examples');
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  await sql.begin(async transaction => {
    await transaction`SELECT pg_advisory_xact_lock(73429024)`;
    const [owner] = await transaction`SELECT id, tenant_id FROM users WHERE is_active ORDER BY (role = 'admin') DESC, created_at LIMIT 1`;
    if (!owner) throw new Error('Register the first local account before installing examples');
    for (const example of examples) {
      const existing = await transaction`SELECT id FROM characters WHERE card_data->'extensions'->'squaretable'->>'sample_id' = ${example.key}`;
      if (existing.length) continue;
      const card = { ...example.cardData, extensions: { ...example.cardData.extensions, squaretable: { ...example.cardData.extensions.squaretable, sample_id: example.key } } };
      await transaction`INSERT INTO characters (tenant_id, creator_id, name, description, avatar_url, card_data, tags, is_public, is_nsfw, moderation_status)
        VALUES (${owner.tenant_id}, ${owner.id}, ${example.name}, ${example.description}, ${example.avatarUrl ?? null}, ${transaction.json(card)}, ${example.tags}, true, false, 'approved')`;
    }
  });
  console.info('Original exploration acceptance examples are available; existing cards were preserved.');
} finally { await sql.end(); }
