import chalk from "chalk";
import WebSocket from "ws";
import { BASE_URL } from "../api-client.js";

export function watchCommand(): void {
  const wsUrl = BASE_URL.replace(/^http/, "ws") + "/ws";
  console.log(chalk.bold(`\nConnecting to live feed at ${wsUrl}\n`));

  const socket = new WebSocket(wsUrl);

  socket.on("open", () => console.log(chalk.green("connected — waiting for events (Ctrl+C to exit)\n")));

  socket.on("message", (raw) => {
    try {
      const event = JSON.parse(raw.toString());
      if (event.type === "notification") {
        const n = event.payload;
        console.log(`${chalk.dim(new Date().toLocaleTimeString())} ${chalk.cyan(`[${n.category}]`)} ${n.title}`);
      } else if (event.type === "hello") {
        console.log(chalk.dim(event.message));
      } else {
        console.log(chalk.dim(JSON.stringify(event)));
      }
    } catch {
      console.log(chalk.dim(raw.toString()));
    }
  });

  socket.on("close", () => {
    console.log(chalk.yellow("\nconnection closed"));
    process.exit(0);
  });

  socket.on("error", (err) => {
    console.error(chalk.red(`connection error: ${err.message}`));
    process.exit(1);
  });
}
