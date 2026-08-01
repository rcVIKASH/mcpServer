import { FastMCP } from "fastmcp";
import { z } from "zod";

const server = new FastMCP({
  name: "calculator-server",
  version: "1.0.0",
});

server.addTool({
  name: "add",
  description: "Add two numbers together",
  parameters: z.object({
    a: z.number().describe("First number"),
    b: z.number().describe("Second number"),
  }),
  execute: async ({ a, b }) => {
    return `${a} + ${b} = ${a + b}`;
  },
});

server.start({
  transportType: "stdio",
});