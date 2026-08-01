import { FastMCP, UserError } from "fastmcp";
import { z } from "zod";
import * as expenseDB from "./db/expenseDB.js";

const server = new FastMCP({
  name: "expense-tracker",
  version: "1.0.0",
});

// Shape of a row coming back from db/expenseDB.js
interface ExpenseRow {
  id: number;
  description: string;
  amount: number;
  date: string;
  category: string;
  subcategory: string | null;
  type: "debit" | "credit";
}

function formatEntry(entry: ExpenseRow): string {
  const sign = entry.type === "credit" ? "+" : "-";
  const sub = entry.subcategory ? ` / ${entry.subcategory}` : "";
  const desc = entry.description ? `: ${entry.description}` : "";
  return `#${entry.id} [${entry.date}] ${sign}$${entry.amount.toFixed(2)} — ${entry.category}${sub}${desc}`;
}

// add (expense)

server.addTool({
  name: "addExpense",
  description: "Add an expense (money going out) to the tracker",
  parameters: z.object({
    amount: z.number().positive().describe("Amount of the expense"),
    category: z
      .string()
      .describe("Category of the expense, e.g. groceries, rent"),
    date: z.string().describe("Date of the expense in YYYY-MM-DD format"),
    description: z
      .string()
      .optional()
      .describe("Optional note about the expense"),
    subcategory: z.string().optional().describe("Optional subcategory"),
  }),
  execute: async ({ amount, category, date, description, subcategory }) => {
    const entry = (await expenseDB.addEntry({
      amount,
      category,
      date,
      description,
      subcategory,
      type: "debit",
    })) as ExpenseRow;
    return `Added expense ${formatEntry(entry)}`;
  },
});

// credit (income, refunds, etc.)

server.addTool({
  name: "addCredit",
  description:
    "Add a credit (money coming in — income, refund, etc.) to the tracker",
  parameters: z.object({
    amount: z.number().positive().describe("Amount of the credit"),
    category: z
      .string()
      .describe("Category of the credit, e.g. salary, refund"),
    date: z.string().describe("Date of the credit in YYYY-MM-DD format"),
    description: z
      .string()
      .optional()
      .describe("Optional note about the credit"),
    subcategory: z.string().optional().describe("Optional subcategory"),
  }),
  execute: async ({ amount, category, date, description, subcategory }) => {
    const entry = (await expenseDB.addEntry({
      amount,
      category,
      date,
      description,
      subcategory,
      type: "credit",
    })) as ExpenseRow;
    return `Added credit ${formatEntry(entry)}`;
  },
});

// list

server.addTool({
  name: "listExpenses",
  description:
    "List expenses and credits, optionally filtered by category, type, or date range",
  parameters: z.object({
    category: z.string().optional().describe("Filter by category"),
    subcategory: z.string().optional().describe("Filter by subcategory"),
    type: z
      .enum(["debit", "credit"])
      .optional()
      .describe("Filter by entry type"),
    startDate: z
      .string()
      .optional()
      .describe("Only entries on/after this date (YYYY-MM-DD)"),
    endDate: z
      .string()
      .optional()
      .describe("Only entries on/before this date (YYYY-MM-DD)"),
  }),
  execute: async (filters) => {
    const rows = (await expenseDB.listExpenses(filters)) as ExpenseRow[];
    if (rows.length === 0) {
      return "No matching entries found.";
    }
    return rows.map(formatEntry).join("\n");
  },
});

// edit

server.addTool({
  name: "editExpense",
  description: "Edit an existing expense or credit by id",
  parameters: z.object({
    id: z.number().describe("Id of the entry to edit"),
    amount: z.number().positive().optional(),
    category: z.string().optional(),
    date: z.string().optional(),
    description: z.string().optional(),
    subcategory: z.string().optional(),
    type: z.enum(["debit", "credit"]).optional(),
  }),
  execute: async ({ id, ...fields }) => {
    try {
      const updated = (await expenseDB.updateExpense(id, fields)) as ExpenseRow;
      return `Updated entry ${formatEntry(updated)}`;
    } catch (err) {
      throw new UserError(
        err instanceof Error ? err.message : "Failed to update entry.",
      );
    }
  },
});

// delete

server.addTool({
  name: "deleteExpense",
  description: "Delete an expense or credit by id",
  parameters: z.object({
    id: z.number().describe("Id of the entry to delete"),
  }),
  execute: async ({ id }) => {
    try {
      const deleted = (await expenseDB.deleteExpense(id)) as ExpenseRow;
      return `Deleted entry ${formatEntry(deleted)}`;
    } catch (err) {
      throw new UserError(
        err instanceof Error ? err.message : "Failed to delete entry.",
      );
    }
  },
});

// summarize

server.addTool({
  name: "summarizeExpenses",
  description:
    "Summarize expenses and credits by category over an optional date range, with totals and balance",
  parameters: z.object({
    startDate: z
      .string()
      .optional()
      .describe("Only entries on/after this date (YYYY-MM-DD)"),
    endDate: z
      .string()
      .optional()
      .describe("Only entries on/before this date (YYYY-MM-DD)"),
  }),
  execute: async ({ startDate, endDate }) => {
    const summary = await expenseDB.summarize({ startDate, endDate });

    if (summary.byCategory.length === 0) {
      return "No entries found for the given period.";
    }

    const lines = summary.byCategory.map((row: any) => {
      const sign = row.type === "credit" ? "+" : "-";
      const plural = row.count === 1 ? "entry" : "entries";
      return `${sign}$${row.total.toFixed(2)} — ${row.category} (${row.count} ${plural})`;
    });

    lines.push("");
    lines.push(`Total credits: $${summary.totalCredits.toFixed(2)}`);
    lines.push(`Total debits:  $${summary.totalDebits.toFixed(2)}`);
    lines.push(`Balance:       $${summary.balance.toFixed(2)}`);

    return lines.join("\n");
  },
});

server.start({
  transportType: "stdio",
});
