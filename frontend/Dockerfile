# Production frontend image — build context MUST be repository root:
#   docker build -f frontend/Dockerfile .
FROM node:20-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
RUN npm ci --workspace=frontend

COPY shared/lesson-body ./shared/lesson-body
COPY frontend ./frontend

WORKDIR /app/frontend

ARG VITE_API_BASE_URL=
ARG VITE_WS_URL=
ARG VITE_WS_BASE_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_WS_URL=$VITE_WS_URL
ENV VITE_WS_BASE_URL=$VITE_WS_BASE_URL

RUN npm run build:docker

FROM nginx:alpine AS production

COPY frontend/nginx-spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
