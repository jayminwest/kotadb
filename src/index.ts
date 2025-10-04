import { createRouter } from "@api/routes";
import { ensureSchema, openDatabase } from "@db/schema";

const PORT = Number(process.env.PORT ?? 3000);

async function bootstrap() {
  const { db, path } = openDatabase();
  ensureSchema(db);

  const router = createRouter(db);

  const server = Bun.serve({
    port: PORT,
    fetch: async (request: Request) => {
      try {
        return await router.handle(request);
      } catch (error) {
        console.error("Request failure", error);
        return new Response(
          JSON.stringify({ error: "Internal server error" }),
          {
            status: 500,
            headers: { "content-type": "application/json" }
          }
        );
      }
    },
    error(error: Error) {
      console.error("Unhandled server error", error);
      return new Response("Internal error", { status: 500 });
    }
  });

  console.log(`KotaDB server listening on http://localhost:${server.port}`);
  console.log(`Using SQLite database at ${path}`);
}

bootstrap().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
