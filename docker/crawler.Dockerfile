FROM oven/bun:1.2.15
WORKDIR /app
COPY package.json ./
COPY apps/crawler/package.json apps/crawler/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN bun install
COPY . .
CMD ["bun", "--filter", "@re-agent/crawler", "dev"]
