# --- build stage: compile TypeScript, with dev dependencies available ---------
FROM node:22-alpine AS build
WORKDIR /app

# package files first: this layer is cached unless dependencies change,
# so day-to-day code edits rebuild in seconds.
COPY package.json package-lock.json ./
# --include=dev explicitly: TypeScript is a devDependency, and if the build
# environment sets NODE_ENV=production npm would silently skip it.
RUN npm ci --include=dev

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# --- runtime stage: production dependencies and compiled output only ---------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# Never run as root. If the process is ever compromised, this is the difference
# between a contained problem and a container-wide one.
USER node

EXPOSE 8080

# The platform uses this to decide whether the container is healthy. It hits the
# public health route, which needs no token.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
