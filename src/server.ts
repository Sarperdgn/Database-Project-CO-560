import { app } from "./app.js";
import { config } from "./config.js";
import { assertDatabaseConnection } from "./db.js";

async function main(): Promise<void> {
  await assertDatabaseConnection();

  app.listen(config.port, () => {
    console.log(`Auth API listening on port ${config.port}`);
  });
}

main().catch((error) => {
  console.error("Failed to start application:", error);
  process.exit(1);
});
