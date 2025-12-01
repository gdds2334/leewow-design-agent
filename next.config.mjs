/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverComponentsExternalPackages: ['sharp', 'onnxruntime-node'],
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // For API routes
  serverRuntimeConfig: {
    maxBodySize: '10mb',
    api: {
      bodyParser: {
        sizeLimit: '10mb',
      },
    },
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'x-api-timeout',
            value: '60000',
          },
        ],
      },
    ];
  },
};

export default nextConfig;




