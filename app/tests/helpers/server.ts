/**
 * Test server lifecycle helpers for Express app testing.
 */

import type { Express } from "express";
import type { Server } from "node:http";
import { createExpressApp } from "@api/routes";
import { getSupabaseTestClient } from "./db";

/**
 * Start a test server instance
 *
 * @returns Server instance, Express app, and base URL
 */
export async function startTestServer(): Promise<{
  app: Express;
  server: Server;
  url: string;
}> {
  const supabase = getSupabaseTestClient();
  const app = createExpressApp(supabase);

  // Use a random port for parallel test execution
  const port = 0; // 0 = assign random available port

  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to get server address"));
        return;
      }

      const url = `http://localhost:${address.port}`;
      console.log(`Test server started on ${url}`);
      resolve({ app, server, url });
    });

    server.on("error", reject);
  });
}

/**
 * Stop a test server instance
 *
 * @param server - Server instance to stop
 */
export async function stopTestServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err);
      } else {
        console.log("Test server stopped");
        resolve();
      }
    });
  });
}
