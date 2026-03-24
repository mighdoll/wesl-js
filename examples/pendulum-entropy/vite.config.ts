import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import viteWesl from "wesl-plugin/vite";

const caRoot = execSync("mkcert -CAROOT", { encoding: "utf-8" }).trim();
const keyFile = path.join(caRoot, "localhost+1-key.pem");
const hasMkcert = fs.existsSync(keyFile);

export default {
  plugins: [viteWesl()],
  server: {
    host: true,
    ...(hasMkcert && {
      https: { key: fs.readFileSync(keyFile), cert: fs.readFileSync(path.join(caRoot, "localhost+1.pem")) },
    }),
  },
};
