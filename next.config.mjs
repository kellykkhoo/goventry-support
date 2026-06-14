/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@prisma/client", "@opengovsg/formsg-sdk"],
};

export default nextConfig;
