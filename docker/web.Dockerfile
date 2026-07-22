FROM oven/bun:1.2.15
WORKDIR /app
COPY package.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/database/package.json packages/database/package.json
RUN bun install
COPY . .
EXPOSE 3000
CMD ["bun", "--filter", "@re-agent/web", "dev"]
