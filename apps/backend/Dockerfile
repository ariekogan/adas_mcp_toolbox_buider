FROM node:22-alpine

# Install Python and pip for running MCP servers
RUN apk add --no-cache python3 py3-pip

# Install common MCP dependencies globally
RUN pip3 install --break-system-packages fastmcp httpx uvicorn

RUN corepack enable

# Copy linked local package and install its deps
COPY packages/skill-validator /packages/skill-validator
RUN cd /packages/skill-validator && pnpm install --prod --no-frozen-lockfile

WORKDIR /app

COPY apps/backend/package.json ./
RUN pnpm install --prod --no-frozen-lockfile

COPY apps/backend/src ./src

ENV PORT=4000
EXPOSE 4000

# Health check so Docker knows when the backend is ready
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/health || exit 1

CMD ["pnpm", "start"]
