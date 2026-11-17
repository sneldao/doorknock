# doorknock-bifrost — the upstream Bifrost gateway plus the grounding-gate
# plugin (PS-04). The .so is built inside the transports module of the
# matching upstream tag so its module build list is identical to the
# gateway binary's — Go plugin loading rejects a .so built against even
# slightly different dependency versions.
#
# Keep BIFROST_REF (source tag) and BIFROST_IMAGE (runtime tag) in lockstep:
# transports/v2.5.1 pins core v1.15.2 and ships as docker.io/maximhq/bifrost:v2.5.1.
# FROM-usable ARGs must be declared before the first stage.
ARG BIFROST_REF=transports/v2.5.1
ARG BIFROST_IMAGE=docker.io/maximhq/bifrost:v2.5.1

# --- Plugin build stage ---------------------------------------------------
FROM golang:1.27.3-alpine3.24 AS plugin-builder

RUN apk upgrade --no-cache && apk add --no-cache gcc musl-dev git

ARG BIFROST_REF
WORKDIR /bifrost
RUN git clone --depth 1 --branch "${BIFROST_REF}" https://github.com/maximhq/bifrost .

# Drop the plugin sources into the transports module (go.mod/go.sum/tests
# excluded) so `go build` resolves every dependency from the same module
# the gateway binary was built from.
COPY plugins/grounding/ ./transports/plugins_grounding/
RUN rm -f ./transports/plugins_grounding/go.mod \
          ./transports/plugins_grounding/go.sum \
          ./transports/plugins_grounding/README.md \
          ./transports/plugins_grounding/*_test.go

WORKDIR /bifrost/transports
# Same toolchain settings the upstream image's builder stage uses.
ENV GOWORK=off CGO_ENABLED=1 GOOS=linux
RUN go build -buildmode=plugin -a -trimpath -ldflags="-w -s" \
      -o /out/grounding-gate.so ./plugins_grounding

# --- Runtime --------------------------------------------------------------
ARG BIFROST_IMAGE
FROM ${BIFROST_IMAGE}
COPY --from=plugin-builder /out/grounding-gate.so /app/plugins/grounding-gate.so
