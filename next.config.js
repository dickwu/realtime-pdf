const path = require("node:path");

/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  output: "export",
  distDir: "dist",
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: ["http://localhost", "http://127.0.0.1"],
  turbopack: {
    root: path.resolve(__dirname),
  },
};
