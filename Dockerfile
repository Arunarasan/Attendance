# Stage 1: build the web app (the backend serves it, so no separate static site or /api rewrite is needed).
FROM node:20-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: build the backend and bundle the web app into it.
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build
COPY backend/pom.xml .
# Maven Central sometimes answers 429 (too many requests) to shared build servers, so retry with a pause instead of failing the deploy.
ENV MVN="mvn -q -B -Dmaven.wagon.http.retryHandler.count=5 -Dmaven.wagon.httpconnectionManager.ttlSeconds=30"
RUN for i in 1 2 3 4 5; do $MVN dependency:go-offline && break; echo "retry $i"; sleep $((i * 20)); done
COPY backend/src ./src
COPY --from=web /web/dist ./src/main/resources/static
RUN for i in 1 2 3 4 5; do $MVN package -DskipTests && break; echo "retry $i"; sleep $((i * 20)); done; test -n "$(ls target/attendance-*.jar 2>/dev/null)"

FROM eclipse-temurin:17-jre
WORKDIR /app
# The version is not hard-coded, so a version bump does not break the image. (attendance-*.jar does not match the .jar.original file.)
COPY --from=build /build/target/attendance-*.jar app.jar
# Run as an ordinary user, not root. ./data is where the default file database lives.
RUN useradd --system --uid 10001 --no-create-home app && mkdir -p /app/data && chown -R app /app
USER app
ENV JAVA_TOOL_OPTIONS="-Xmx350m -XX:+UseSerialGC"
EXPOSE 8080
# Render supplies $PORT; fall back to 8080 locally. Health check path for the platform: /api/public/health
CMD ["sh", "-c", "java -Dserver.port=${PORT:-8080} -jar app.jar"]
