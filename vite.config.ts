import { defineConfig, type Plugin } from "vite";
import { resolve } from "path";
import { readFileSync } from "node:fs";

// `scratch-render-fonts` (used by `scratch-svg-renderer`) loads its bundled
// fonts with webpack-style `base64-loader!./font.ttf` requires, which neither
// esbuild (Vite dep optimizer) nor Rollup understands. This plugin teaches Vite
// to resolve such ids by reading the target file and inlining its base64
// contents, matching what `base64-loader` would return.
const gandiBase64Loader = (): Plugin => {
  const base64Prefix = "base64-loader!";
  const virtualPrefix = "\0gandi-base64-loader:";
  return {
    name: "gandi-base64-loader",
    enforce: "pre",
    async resolveId(source, importer) {
      if (source.startsWith(base64Prefix)) {
        const rel = source.slice(base64Prefix.length);
        const resolved = await this.resolve(rel, importer, { skipSelf: true });
        if (resolved) {
          return `${virtualPrefix}${resolved.id}`;
        }
        // Fall back to resolving relative to the importer directory.
        return `${virtualPrefix}${resolve(
          importer ? resolve(importer, "..") : process.cwd(),
          rel,
        )}`;
      }
      return null;
    },
    load(id) {
      if (id.startsWith(virtualPrefix)) {
        const filePath = id.slice(virtualPrefix.length);
        const b64 = readFileSync(filePath).toString("base64");
        return `export default ${JSON.stringify(b64)};`;
      }
      return null;
    },
  };
};

export default defineConfig({
  plugins: [gandiBase64Loader()],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "ScratchRender",
      formats: ["es", "umd"],
      fileName: (format) =>
        `scratch-render.${format === "es" ? "mjs" : "umd.js"}`,
    },
    rollupOptions: {
      external: ["three", "scratch-svg-renderer"],
      output: {
        globals: {
          three: "THREE",
          "scratch-svg-renderer": "ScratchSvgRenderer",
        },
      },
    },
    sourcemap: true,
    minify: false,
    target: "es2017",
  },
  resolve: {
    extensions: [".ts", ".js"],
    alias: {
      // // Force resolution to the ESM-friendly source (which provides named
      // // exports like `loadSvgString`). The `browser` export condition points
      // // to a pre-bundled UMD file that lacks named exports.
      // "scratch-svg-renderer": resolve(
      //   __dirname,
      //   "node_modules/scratch-svg-renderer/src/index.js",
      // ),
    },
  },
  optimizeDeps: {
    // `scratch-render-fonts` uses webpack-style `base64-loader!` requires that
    // esbuild cannot parse, so it must be kept out of pre-bundling and handled
    // by the `gandiBase64Loader` plugin instead.
    exclude: ["scratch-render-fonts"],
  },
});
