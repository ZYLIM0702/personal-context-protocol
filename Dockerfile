# PCP (Personal Context Protocol) reference server.
# Qloo is called through the official `qloo mcp` harness, so it is installed in the image.
FROM node:22-bookworm-slim AS web
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci && npm cache clean --force
COPY web/ ./
COPY public/sdk /app/public/sdk
RUN npm run build

FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787

RUN npm install --global @qloo/qloo-harness@0.1.26 && npm cache clean --force

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
COPY --from=web /app/web/out ./web/out
RUN mkdir -p data && chown -R node:node /app

USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8787) + '/').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "--disable-warning=ExperimentalWarning", "server.mjs"]
