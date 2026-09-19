FROM node:20-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
COPY blockchain/package.json blockchain/package.json
COPY backend/package.json backend/package.json
COPY cli-client/package.json cli-client/package.json
RUN npm ci --ignore-scripts

COPY . .
RUN chmod +x scripts/*.sh

ENV NODE_ENV=development
CMD ["npm", "run", "lint"]
