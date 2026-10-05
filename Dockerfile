# -----------------------------------------------------------------------------
# Pellet Stock integration image.
#
# Gladys sandbox constraints ("the sandbox is the defense"):
#   - rootfs mounted READ-ONLY -> never write outside /data
#   - a single writable volume: /data
#   - runs as a non-root user
#   - multi-arch image (linux/amd64 + linux/arm64), see the CI workflow
# -----------------------------------------------------------------------------

FROM node:24-alpine

# dumb-init: handles signals (SIGTERM) correctly for a graceful shutdown.
RUN apk add --no-cache dumb-init

WORKDIR /app

# Install the PROD dependencies first (better build cache). `npm ci` only:
# a lockfile out of sync with package.json must fail the build, not be
# silently re-resolved into an untested dependency tree.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# TEMPORARY, until the SDK relays them (expected in 0.15): pass the values
# typed in a widget action form to onWidgetAction (Gladys PR #3168). The grep
# fails the build if the SDK line moved, instead of shipping a silent no-op.
RUN sed -i 's|{ settings: payload.settings }|{ settings: payload.settings, values: payload.values }|' \
      node_modules/@gladysassistant/integration-sdk/lib/gladys-integration.js \
 && grep -q 'values: payload.values' node_modules/@gladysassistant/integration-sdk/lib/gladys-integration.js

# Then the integration code.
COPY index.js ./
COPY src ./src
COPY gladys-assistant-integration.json ./

# The only writable location allowed at runtime.
ENV NODE_ENV=production
VOLUME ["/data"]

# Run as an unprivileged user (already present in the node image).
USER node

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]
