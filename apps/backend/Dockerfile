FROM node:20-alpine

RUN corepack enable

WORKDIR /app

COPY package.json ./
RUN pnpm install --prod --no-frozen-lockfile

COPY src ./src

ENV PORT=4000
EXPOSE 4000

CMD ["pnpm", "start"]
