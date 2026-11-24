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
# Maven Central rate-limits (429) shared build servers such as Render's, so alternate between Google's mirror of central and
# central itself, pausing between attempts. A mirror that lacks an artifact simply fails that attempt and the next one uses central.
RUN echo '<settings><mirrors><mirror><id>gcs-central</id><mirrorOf>central</mirrorOf><url>https://maven-central.storage-download.googleapis.com/maven2/</url></mirror></mirrors></settings>' > /tmp/mirror-settings.xml
ENV MVN_OPTS="-q -B -Dmaven.wagon.http.retryHandler.count=5"
RUN for i in 1 2 3 4 5 6; do if [ $((i % 2)) -eq 1 ]; then S="-s /tmp/mirror-settings.xml"; else S=""; fi; mvn $MVN_OPTS $S dependency:go-offline && break; echo "retry $i"; sleep $((i * 15)); done
COPY backend/src ./src
COPY --from=web /web/dist ./src/main/resources/static
RUN for i in 1 2 3 4 5 6; do if [ $((i % 2)) -eq 1 ]; then S="-s /tmp/mirror-settings.xml"; else S=""; fi; mvn $MVN_OPTS $S package -DskipTests && break; echo "retry $i"; sleep $((i * 15)); done; test -n "$(ls target/attendance-*.jar 2>/dev/null)"

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
