import { app } from "./app.js";
import { config } from "./config.js";
app.listen(config.port, () => {
  console.log(`MariaDB tutorial API listening on port ${config.port}`);
});
