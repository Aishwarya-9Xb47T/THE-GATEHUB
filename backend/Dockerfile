# Production backend image — build context MUST be the repository root:
#   docker build -f backend/Dockerfile .
# Render: Runtime = Docker, Dockerfile path = ./backend/Dockerfile, context = .
# Do not set Root Directory to backend (shared/lesson-body would be missing).
# No secrets in this file. Neon DATABASE_URL / B2 / JWT come from Render runtime env.
FROM node:20-bookworm-slim AS build

ENV DEBIAN_FRONTEND=noninteractive
ENV SKIP_TINYTEX=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install

COPY shared/lesson-body /app/shared/lesson-body
COPY backend/ ./

# Dummy URL is only for `prisma generate` (schema requires the env name). Not a real secret.
RUN DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build" npx prisma generate
RUN npm run build
RUN npx tsc scripts/validate-startup.ts \
  --module NodeNext --moduleResolution NodeNext --target ES2022 \
  --outDir dist/scripts --esModuleInterop --skipLibCheck

FROM node:20-bookworm-slim AS production

ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /app
COPY backend/package*.json ./
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
RUN npm install --omit=dev \
  && npm install --omit=dev --no-save prisma@5.22.0

# Depend on the build stage so TeX install does not run in parallel with npm (avoids OOM).
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/prisma ./prisma
COPY --from=build /app/backend/dist/scripts/validate-startup.js ./dist/scripts/validate-startup.js
COPY --from=build /app/shared/lesson-body /shared/lesson-body
COPY backend/scripts/docker-entrypoint.sh /docker-entrypoint.sh

# pdflatex MUST exist in this final runtime stage (not only during build).
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    openssl \
    curl \
    python3 \
    gcc \
    g++ \
    default-jdk-headless \
    texlive-latex-base \
    texlive-latex-recommended \
    texlive-fonts-recommended \
    texlive-latex-extra \
    texlive-pictures \
    chromium \
    fonts-liberation \
    fonts-dejavu-core \
    fonts-noto-core \
    libreoffice-impress \
    poppler-utils \
  && rm -rf /var/lib/apt/lists/* \
  && test -x /usr/bin/pdflatex \
  && command -v pdflatex \
  && pdflatex --version \
  && (test -x /usr/bin/chromium || test -x /usr/bin/chromium-browser) \
  && (test -x /usr/bin/soffice || test -x /usr/lib/libreoffice/program/soffice) \
  && command -v pdftocairo \
  && command -v pdftoppm \
  && test -x /usr/bin/python3 \
  && ln -sf /usr/bin/python3 /usr/bin/python \
  && command -v gcc \
  && command -v g++ \
  && command -v javac \
  && chmod +x /docker-entrypoint.sh \
  && mkdir -p uploads uploads/latex uploads/latex/pdfs data \
  && DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build" npx prisma generate

ENV NODE_ENV=production
ENV PORT=5000
ENV UPLOAD_DIR=/app/uploads
ENV PATH="/usr/bin:${PATH}"
ENV LATEX_PDFLATEX_PATH=/usr/bin/pdflatex
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/api/health" || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
