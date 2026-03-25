import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import viteWesl from "wesl-plugin/vite";

function mkcertHttps(): object | undefined {
  try {
    const caRoot = execSync("mkcert -CAROOT", { encoding: "utf-8" }).trim();
    const keyFile = path.join(caRoot, "localhost+1-key.pem");
    const certFile = path.join(caRoot, "localhost+1.pem");
    if (!fs.existsSync(keyFile)) return;
    return { key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) };
  } catch {
    return;
  }
}

export default {
  plugins: [viteWesl()],
  server: {
    host: true,
    https: mkcertHttps(),
  },
};
