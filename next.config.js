// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  
  // Output standalone for Railway
  output: 'standalone',
  
  // Ensure static assets are properly served
  assetPrefix: process.env.NODE_ENV === 'production' ? '' : undefined,
  
  // Webpack config to handle Bootstrap icons
  webpack: (config) => {
    config.module.rules.push({
      test: /\.(woff|woff2|eot|ttf|otf)$/i,
      type: 'asset/resource',
    });
    return config;
  },
}

module.exports = nextConfig;