import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "expenses.db");

export const db = new Database(dbPath);

console.log("Connected to SQLite:", dbPath);

// --------------------
// Types
// --------------------

export interface Expense {
  id: number;
  description: string;
  amount: number;
  date: string;
  category: string;
  subcategory: string | null;
  type: "debit" | "credit";
}

export interface AddExpenseInput {
  description?: string;
  amount: number;
  category: string;
  date: string;
  subcategory?: string | null;
  type?: "debit" | "credit";
}

export interface ExpenseFilters {
  category?: string;
  subcategory?: string;
  type?: "debit" | "credit";
  startDate?: string;
  endDate?: string;
}

export interface UpdateExpenseInput {
  description?: string;
  amount?: number;
  category?: string;
  subcategory?: string | null;
  date?: string;
  type?: "debit" | "credit";
}

interface SummaryRow {
  category: string;
  type: "debit" | "credit";
  total: number;
  count: number;
}

interface Totals {
  totalDebits: number;
  totalCredits: number;
}

// --------------------
// Create table
// --------------------

db.exec(`
CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL DEFAULT '',
    amount REAL NOT NULL,
    date TEXT NOT NULL,
    category TEXT NOT NULL,
    subcategory TEXT,
    type TEXT NOT NULL DEFAULT 'debit'
        CHECK (type IN ('debit','credit'))
)
`);

// --------------------
// Prepared statements
// --------------------

const insertStmt = db.prepare(`
INSERT INTO expenses
(description,amount,date,category,subcategory,type)
VALUES (?,?,?,?,?,?)
`);

const getByIdStmt = db.prepare("SELECT * FROM expenses WHERE id = ?");

const deleteStmt = db.prepare("DELETE FROM expenses WHERE id = ?");

// --------------------
// Add
// --------------------

export function addEntry({
  description = "",
  amount,
  category,
  date,
  subcategory = null,
  type = "debit",
}: AddExpenseInput): Expense {
  const result = insertStmt.run(
    description,
    amount,
    date,
    category,
    subcategory,
    type,
  );

  return getExpenseById(Number(result.lastInsertRowid));
}

// --------------------
// Get
// --------------------

export function getExpenseById(id: number): Expense {
  const row = getByIdStmt.get(id);

  if (!row) {
    throw new Error(`No entry found with id ${id}`);
  }

  return row as Expense;
}

// --------------------
// List
// --------------------

export function listExpenses({
  category,
  subcategory,
  type,
  startDate,
  endDate,
}: ExpenseFilters = {}): Expense[] {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (category) {
    clauses.push("category=?");
    params.push(category);
  }

  if (subcategory) {
    clauses.push("subcategory=?");
    params.push(subcategory);
  }

  if (type) {
    clauses.push("type=?");
    params.push(type);
  }

  if (startDate) {
    clauses.push("date>=?");
    params.push(startDate);
  }

  if (endDate) {
    clauses.push("date<=?");
    params.push(endDate);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

  return db
    .prepare(
      `
      SELECT *
      FROM expenses
      ${where}
      ORDER BY date DESC,id DESC
    `,
    )
    .all(...params) as Expense[];
}

// --------------------
// Update
// --------------------

export function updateExpense(id: number, fields: UpdateExpenseInput): Expense {
  const allowed = [
    "description",
    "amount",
    "category",
    "subcategory",
    "date",
    "type",
  ] as const;

  const sets: string[] = [];
  const params: unknown[] = [];

  for (const key of allowed) {
    const value = fields[key];

    if (value !== undefined) {
      sets.push(`${key}=?`);
      params.push(value);
    }
  }

  if (sets.length === 0) {
    throw new Error("No fields to update.");
  }

  params.push(id);

  const result = db
    .prepare(
      `
      UPDATE expenses
      SET ${sets.join(",")}
      WHERE id=?
  `,
    )
    .run(...params);

  if (result.changes === 0) {
    throw new Error(`No entry found with id ${id}`);
  }

  return getExpenseById(id);
}

// --------------------
// Delete
// --------------------

export function deleteExpense(id: number): Expense {
  const existing = getExpenseById(id);

  deleteStmt.run(id);

  return existing;
}

// --------------------
// Summary
// --------------------

export function summarize({
  startDate,
  endDate,
}: Pick<ExpenseFilters, "startDate" | "endDate"> = {}) {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (startDate) {
    clauses.push("date>=?");
    params.push(startDate);
  }

  if (endDate) {
    clauses.push("date<=?");
    params.push(endDate);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

  const byCategory = db
    .prepare(
      `
      SELECT
        category,
        type,
        SUM(amount) AS total,
        COUNT(*) AS count
      FROM expenses
      ${where}
      GROUP BY category,type
      ORDER BY total DESC
  `,
    )
    .all(...params) as SummaryRow[];

  const totals = db
    .prepare(
      `
      SELECT
        COALESCE(
          SUM(CASE WHEN type='debit' THEN amount ELSE 0 END),
          0
        ) AS totalDebits,

        COALESCE(
          SUM(CASE WHEN type='credit' THEN amount ELSE 0 END),
          0
        ) AS totalCredits

      FROM expenses
      ${where}
  `,
    )
    .get(...params) as Totals;

  return {
    byCategory,
    totalDebits: totals.totalDebits,
    totalCredits: totals.totalCredits,
    balance: totals.totalCredits - totals.totalDebits,
  };
}
