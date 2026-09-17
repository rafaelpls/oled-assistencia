FROM node:22-bookworm-slim AS base

RUN apt-get update \
    && apt-get install -y openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY backend/prisma ./backend/prisma

RUN npm ci

COPY . .

RUN npx prisma generate
RUN npx tsc -p backend/tsconfig.json


# =========================
# BACKEND
# =========================
FROM base AS backend

ENV NODE_ENV=production

RUN mkdir -p /app/uploads \
    && chown -R node:node /app/uploads

USER node

EXPOSE 4000

CMD ["node", "dist/backend/src/main.js"]


# =========================
# FRONTEND
# =========================
FROM base AS frontend

ARG API_INTERNAL_URL=http://backend:4000

ENV API_INTERNAL_URL=${API_INTERNAL_URL}
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npx next build frontend

USER node

EXPOSE 3000

CMD ["node", "node_modules/next/dist/bin/next", "start", "frontend", "--hostname", "0.0.0.0"]
