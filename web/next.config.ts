// web/next.config.js
const path = require('node:path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // evita el warning de lockfiles en el monorepo
  outputFileTracingRoot: path.join(__dirname, '..'),
};

module.exports = nextConfig;
