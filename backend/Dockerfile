# Production backend image — build context MUST be the repository root:
#   docker build -f backend/Dockerfile .
# Render: Dockerfile path = backend/Dockerfile, context = repository root (not backend/).
FROM node:20-bookworm-slim AS build

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install

COPY shared/lesson-body /app/shared/lesson-body
COPY backend/ ./

RUN npx prisma generate
RUN npm run build
RUN npx tsc scripts/validate-startup.ts \
  --module NodeNext --moduleResolution NodeNext --target ES2022 \
  --outDir dist/scripts --esModuleInterop --skipLibCheck

FROM node:20-bookworm-slim AS production

ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /app
COPY backend/package*.json ./
RUN npm install --omit=dev \
  && npm install --omit=dev --no-save prisma@5.22.0

# Depend on the build stage so TeX install does not run in parallel with npm (avoids OOM).
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/prisma ./prisma
COPY --from=build /app/backend/src/generated ./src/generated
COPY --from=build /app/backend/dist/scripts/validate-startup.js ./dist/scripts/validate-startup.js
COPY --from=build /app/shared/lesson-body /shared/lesson-body
COPY backend/scripts/docker-entrypoint.sh /docker-entrypoint.sh

# Minimum TeX for GateHub: pdflatex, bibtex, graphicx, hyperref, AMS, listings, xcolor, tcolorbox, enumitem, grffile
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    openssl \
    curl \
    texlive-latex-base \
    texlive-latex-recommended \
    texlive-fonts-recommended \
    texlive-latex-extra \
    texlive-pictures \
  && rm -rf /var/lib/apt/lists/* \
  && command -v pdflatex \
  && pdflatex --version \
  && chmod +x /docker-entrypoint.sh \
  && mkdir -p uploads uploads/latex uploads/latex/pdfs data

ENV NODE_ENV=production
ENV PORT=5000
ENV UPLOAD_DIR=/app/uploads
ENV PATH="/usr/bin:${PATH}"

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/api/health" || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
