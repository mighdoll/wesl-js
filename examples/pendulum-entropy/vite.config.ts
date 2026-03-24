import fs from "node:fs";
import viteWesl from "wesl-plugin/vite";

export default {
  plugins: [viteWesl()],
  server: {
    host: true,
    https: {
      key: fs.readFileSync("./localhost+1-key.pem"),
      cert: fs.readFileSync("./localhost+1.pem"),
    },
  },
};
