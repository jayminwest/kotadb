import { createExpressApp } from "@api/routes";
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

  // Create Express app
  const app = createExpressApp(supabase);

  // Start server
  const server = app.listen(PORT, () => {
    console.log(`KotaDB server listening on http://localhost:${PORT}`);
    console.log(`Connected to Supabase at ${supabaseUrl}`);
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    console.log("SIGTERM signal received: closing HTTP server");
    server.close(() => {
      console.log("HTTP server closed");
      process.exit(0);
    });
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
