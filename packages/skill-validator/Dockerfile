FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY src/ ./src/
COPY bin/ ./bin/

EXPOSE 3200

CMD ["node", "src/server.js"]
