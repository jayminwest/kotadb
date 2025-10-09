import { createRouter } from "@api/routes";
import { getServiceClient } from "@db/client";

const PORT = Number(process.env.PORT ?? 3000);

async function bootstrap() {
  // Verify Supabase environment variables
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      "Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set. " +
      "Please copy .env.sample to .env and configure your Supabase credentials."
    );
  }

  // Initialize Supabase client
  const supabase = getServiceClient();

  // Test database connection
  const { error: healthError } = await supabase.from("migrations").select("id").limit(1);
  if (healthError) {
    throw new Error(`Supabase connection failed: ${healthError.message}`);
  }

  const router = createRouter(supabase);

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
  console.log(`Connected to Supabase at ${supabaseUrl}`);
}

bootstrap().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
