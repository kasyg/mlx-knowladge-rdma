# VetAtlas 3D – single container: builds the client and serves it with the API.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8787 VETATLAS_DB=/data/vetatlas.sqlite
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/client/package.json client/
COPY --from=build /app/server/package.json server/
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/client/dist client/dist
COPY --from=build /app/server/src server/src
COPY --from=build /app/shared/src shared/src
VOLUME ["/data"]
EXPOSE 8787
CMD ["node", "--disable-warning=ExperimentalWarning", "server/src/index.ts"]
