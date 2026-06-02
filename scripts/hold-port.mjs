// Hold port 5173 indefinitely (until killed) to simulate a port conflict.
import { createServer } from "node:http";
const holder = createServer((req, res) => res.end("occupied"));
holder.listen(5173, "0.0.0.0", () => {
  console.log("HOLDER: holding 5173");
});
