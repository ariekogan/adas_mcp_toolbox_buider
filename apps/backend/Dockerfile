FROM node:20-alpine

# Install Python and pip for running MCP servers
RUN apk add --no-cache python3 py3-pip

# Install common MCP dependencies globally
RUN pip3 install --break-system-packages fastmcp httpx uvicorn

RUN corepack enable

WORKDIR /app

COPY package.json ./
RUN pnpm install --prod --no-frozen-lockfile

COPY src ./src

ENV PORT=4000
EXPOSE 4000

CMD ["pnpm", "start"]
