import { bootstrapRbac } from "./rbac.bootstrap.js";

async function main(): Promise<void> {
  try {
    await bootstrapRbac();
    console.log("RBAC bootstrap finished.");
  } catch (error) {
    console.error("RBAC bootstrap failed:", error);
    process.exit(1);
  }
}

void main();