FROM oven/bun:1 AS builder
WORKDIR /app
ENV SKIP_ENV_VALIDATION=1

COPY . .
RUN --mount=type=cache,target=/root/.bun/install/cache bun install

ENV NODE_ENV=production
RUN cd apps/server && bun run compile

FROM oven/bun:1 AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN DEBIAN_FRONTEND=noninteractive apt-get update \
  && apt-get upgrade -y \
  && rm -rf /var/lib/apt/lists/*
COPY --chown=bun:bun --from=builder /app/apps/server/server ./server

EXPOSE 3000

USER bun
CMD ["./server"]
