FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build
COPY backend/pom.xml .
RUN mvn -q -B dependency:go-offline
COPY backend/src ./src
RUN mvn -q -B package -DskipTests

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
