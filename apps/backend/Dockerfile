FROM node:20-alpine

# Install Python and pip for running MCP servers
RUN apk add --no-cache python3 py3-pip

# Install common MCP dependencies globally
RUN pip3 install --break-system-packages fastmcp httpx uvicorn

RUN corepack enable

# Copy linked local package first
COPY packages/skill-validator /packages/skill-validator

WORKDIR /app

COPY apps/backend/package.json ./
RUN pnpm install --prod --no-frozen-lockfile

COPY apps/backend/src ./src

ENV PORT=4000
EXPOSE 4000

CMD ["pnpm", "start"]
