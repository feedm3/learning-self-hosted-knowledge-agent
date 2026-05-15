# syntax=docker/dockerfile:1.7
# Build the Mastra app as a self-contained image.
#
#   docker build -t rag-app .
#   docker run --rm -p 4111:4111 rag-app

FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
RUN pnpm install --frozen-lockfile
COPY src ./src
RUN pnpm build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=4111
COPY --from=builder /app/.mastra/output ./
RUN mkdir -p /app/state
EXPOSE 4111
CMD ["node", "./index.mjs"]
