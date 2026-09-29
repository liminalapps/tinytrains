# Plane relay (see relay/main.ts). Node runs the TypeScript directly; no build step, no dependencies.
FROM node:24-slim
WORKDIR /app
COPY relay/package.json ./package.json
COPY shared/cities.ts shared/types.ts ./shared/
COPY server/planes.ts ./server/
COPY relay/main.ts ./relay/
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["node", "relay/main.ts"]
