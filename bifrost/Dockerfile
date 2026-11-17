# doorknock-bifrost — Bifrost gateway + grounding-gate plugin (PS-04).
#
# The official maximhq/bifrost images link the gateway fully static
# (-extldflags '-static'), and a static binary cannot dlopen .so plugins —
# the plugin admin API fails with plugin.Open("…"): realpath failed.
# So this image builds the gateway itself: dynamically linked, same
# transports module and toolchain for the plugin .so — the strongest
# possible Go plugin ABI parity.
#
# Keep BIFROST_REF at the transports release the deployment tracks.
ARG BIFROST_REF=transports/v2.5.1

# --- Build stage: gateway binary (dynamic) + plugin .so -------------------
FROM golang:1.27.3-bookworm AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
      gcc libc6-dev git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV CGO_ENABLED=1 GOOS=linux GOWORK=off

ARG BIFROST_REF
WORKDIR /bifrost
RUN git clone --depth 1 --branch "${BIFROST_REF}" https://github.com/maximhq/bifrost .

WORKDIR /bifrost/transports
RUN go mod download

# main.go has //go:embed all:ui — the embed needs a ui/ dir, but the
# dashboard is unreachable on a private service, so a stub is enough.
RUN mkdir -p bifrost-http/ui && \
    printf '<!doctype html><title>bifrost</title>' > bifrost-http/ui/index.html

# Dynamic binary: NO -extldflags '-static' — dlopen requires it.
RUN go build \
      -ldflags="-w -s -X main.Version=v2.5.1-doorknock" \
      -a -trimpath \
      -tags "sqlite_static" \
      -o /out/main \
      ./bifrost-http

# Plugin sources join the transports module so go.mod/go.sum resolve
# every dependency identically to the gateway binary above.
COPY plugins/grounding/ ./plugins_grounding/
RUN rm -f plugins_grounding/go.mod \
          plugins_grounding/go.sum \
          plugins_grounding/README.md \
          plugins_grounding/*_test.go
RUN go build -buildmode=plugin -a -trimpath -ldflags="-w -s" \
      -o /out/grounding-gate.so ./plugins_grounding

# --- Runtime: mirrors upstream's alpine stage, on glibc -------------------
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /out/main /app/main
COPY --from=builder /out/grounding-gate.so /app/plugins/grounding-gate.so
COPY --from=builder /bifrost/transports/docker-entrypoint.sh /app/docker-entrypoint.sh

ARG ARG_APP_PORT=8080
ARG ARG_APP_HOST=0.0.0.0
ARG ARG_LOG_LEVEL=info
ARG ARG_LOG_STYLE=json
ARG ARG_APP_DIR=/app/data

ENV APP_PORT=$ARG_APP_PORT \
    APP_HOST=$ARG_APP_HOST \
    LOG_LEVEL=$ARG_LOG_LEVEL \
    LOG_STYLE=$ARG_LOG_STYLE \
    APP_DIR=$ARG_APP_DIR \
    GOGC="" \
    GOMEMLIMIT=""

# Same user/data-dir layout as upstream (numeric USER for runAsNonRoot).
RUN mkdir -p "$APP_DIR/logs" && \
    useradd --system --shell /bin/sh appuser && \
    chown -R appuser:appuser /app && \
    chown -R appuser:0 "$APP_DIR" && \
    { [ "$APP_DIR" = "/app" ] || chmod -R g=rwX "$APP_DIR"; } && \
    chmod +x /app/docker-entrypoint.sh
USER 1000:0

VOLUME ["${APP_DIR}"]
EXPOSE $APP_PORT

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["/app/main"]
