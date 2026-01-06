import { Pool } from "pg";

// Database connection configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

// Generic database query function
export async function query(text: string, params?: any[]) {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } catch (error) {
    console.error("Database query error:", error);
    throw error;
  } finally {
    client.release();
  }
}

// Example: Get all items
export async function getAllItems() {
  const result = await query("SELECT * FROM items ORDER BY created_at DESC");
  return result.rows;
}

// Example: Get item by ID
export async function getItemById(id: number) {
  const result = await query("SELECT * FROM items WHERE id = $1", [id]);
  return result.rows[0];
}

// Example: Create new item
export async function createItem(data: { name: string; description: string }) {
  const result = await query(
    "INSERT INTO items (name, description, created_at, updated_at) VALUES ($1, $2, NOW(), NOW()) RETURNING *",
    [data.name, data.description]
  );
  return result.rows[0];
}

// Example: Update item
export async function updateItem(id: number, data: { name?: string; description?: string }) {
  const updates = [];
  const values = [];
  let paramCount = 1;

  if (data.name) {
    updates.push(`name = $${paramCount++}`);
    values.push(data.name);
  }
  if (data.description) {
    updates.push(`description = $${paramCount++}`);
    values.push(data.description);
  }

  updates.push(`updated_at = NOW()`);
  values.push(id);

  const result = await query(
    `UPDATE items SET ${updates.join(", ")} WHERE id = $${paramCount} RETURNING *`,
    values
  );
  return result.rows[0];
}

// Example: Delete item
export async function deleteItem(id: number) {
  const result = await query("DELETE FROM items WHERE id = $1 RETURNING *", [id]);
  return result.rows[0];
}