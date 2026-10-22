FROM golang:1.27-bookworm AS mercado-build
WORKDIR /src
COPY mercado/go.mod mercado/go.sum ./
RUN go mod download
COPY mercado/ ./
RUN go test ./... && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -buildvcs=false -trimpath -ldflags='-s -w' -o /out/klsistemas .

FROM node:24-bookworm-slim AS beauty-build
WORKDIR /src
COPY beauty/package*.json ./
RUN npm ci --include=dev
COPY beauty/ ./
RUN npm run build && npm test

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY beauty/package*.json ./beauty/
RUN cd beauty && npm ci --omit=dev && npm cache clean --force
COPY --from=mercado-build /out/klsistemas ./bin/klsistemas
COPY --from=beauty-build /src/dist ./beauty/dist
COPY beauty/server ./beauty/server
COPY beauty/lib ./beauty/lib
COPY beauty/scripts ./beauty/scripts
COPY package.json server.mjs portal.html ./
COPY scripts ./scripts
COPY admin ./admin
USER node
EXPOSE 10000
CMD ["npm","start"]
