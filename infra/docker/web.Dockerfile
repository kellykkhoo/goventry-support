# infra/docker/web.Dockerfile
# Build context is the repo root (set in compose.yaml)
FROM node:22-slim AS build

WORKDIR /web
COPY apps/frontend/package*.json ./
RUN npm ci
COPY apps/frontend/ .
RUN npm run build

FROM nginx:alpine
COPY --from=build /web/dist /usr/share/nginx/html
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
