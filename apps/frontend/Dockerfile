# --- build stage ---
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /app

ARG VITE_API_URL
ARG VITE_BASE_PATH=/
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_BASE_PATH=$VITE_BASE_PATH

COPY package.json ./
RUN pnpm install --no-frozen-lockfile
COPY . .
RUN pnpm build

# --- runtime stage ---
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
