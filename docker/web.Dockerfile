FROM oven/bun:1.2.15
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY apps/crawler/package.json apps/crawler/package.json
COPY workers/package.json workers/package.json
RUN NODE_ENV=development bun install --frozen-lockfile
COPY . .
EXPOSE 3000
CMD ["bun", "--filter", "@re-agent/web", "dev"]
