# Production backend image — build context MUST be repository root:
#   docker build -f backend/Dockerfile .
FROM node:20-alpine AS build

RUN apk add --no-cache docker-cli openssl

WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install

COPY shared/lesson-body /app/shared/lesson-body
COPY backend/ ./

RUN npx prisma generate
RUN npx tsc -b ../shared/lesson-body
RUN npm run build
RUN npx tsc scripts/validate-startup.ts \
  --module NodeNext --moduleResolution NodeNext --target ES2022 \
  --outDir dist/scripts --esModuleInterop --skipLibCheck

FROM node:20-alpine AS production

RUN apk add --no-cache docker-cli openssl curl

WORKDIR /app
COPY backend/package*.json ./
RUN npm install --omit=dev

COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/prisma ./prisma
COPY --from=build /app/backend/src/generated ./src/generated
COPY --from=build /app/backend/dist/scripts/validate-startup.js ./dist/scripts/validate-startup.js
COPY --from=build /app/shared/lesson-body /shared/lesson-body
COPY backend/scripts/docker-entrypoint.sh /docker-entrypoint.sh

RUN chmod +x /docker-entrypoint.sh \
  && mkdir -p uploads uploads/latex uploads/latex/pdfs data

ENV NODE_ENV=production
ENV PORT=5000
ENV UPLOAD_DIR=/app/uploads

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/api/health" || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
