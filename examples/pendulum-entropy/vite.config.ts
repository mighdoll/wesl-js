import viteWesl from "wesl-plugin/vite";

export default {
  plugins: [viteWesl()],
  server: { host: true, allowedHosts: true },
};
