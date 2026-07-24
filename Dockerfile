FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM caddy:2.10.0-alpine AS runner

RUN setcap -r /usr/bin/caddy \
  && addgroup -S -g 1001 stackhatch \
  && adduser -S -D -H -u 1001 -G stackhatch stackhatch

COPY --from=builder /app/out /srv
COPY --from=builder /app/dist-host/Caddyfile /etc/caddy/Caddyfile

RUN caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

USER stackhatch
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/ || exit 1
