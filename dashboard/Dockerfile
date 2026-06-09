FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
COPY .npmrc package.json pnpm-lock.yaml* ./
RUN pnpm install
COPY . .

# Brand config — NEXT_PUBLIC_* must be present at build time (baked into bundle)
ARG NEXT_PUBLIC_BRAND_NAME
ARG NEXT_PUBLIC_BRAND_TAGLINE
ARG NEXT_PUBLIC_BRAND_SCOPE
ARG NEXT_PUBLIC_QUERY_API_URL
ARG NEXT_PUBLIC_INGESTION_API_URL
ENV NEXT_PUBLIC_BRAND_NAME=$NEXT_PUBLIC_BRAND_NAME \
    NEXT_PUBLIC_BRAND_TAGLINE=$NEXT_PUBLIC_BRAND_TAGLINE \
    NEXT_PUBLIC_BRAND_SCOPE=$NEXT_PUBLIC_BRAND_SCOPE \
    NEXT_PUBLIC_QUERY_API_URL=$NEXT_PUBLIC_QUERY_API_URL \
    NEXT_PUBLIC_INGESTION_API_URL=$NEXT_PUBLIC_INGESTION_API_URL

RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
