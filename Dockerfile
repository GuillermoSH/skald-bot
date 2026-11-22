# syntax=docker/dockerfile:1

# --- Base: Node + pnpm (versión de "packageManager" vía corepack) ---
FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# --- Compilación ---
FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build

# --- Solo dependencias de producción ---
FROM base AS deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod

# --- Imagen final: sin pnpm, sin código fuente, sin herramientas de compilación ---
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

LABEL org.opencontainers.image.title="Skald" \
      org.opencontainers.image.description="Bot de Discord de consulta y avisos para un servidor de Minecraft Java" \
      org.opencontainers.image.source="https://github.com/GuillermoSH/skald-bot"

# Usuario sin privilegios (UID 1000): lee los ficheros del mundo montados en solo lectura.
USER node
CMD ["node", "dist/index.js"]
