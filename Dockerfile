FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build
COPY backend/pom.xml .
RUN mvn -q -B dependency:go-offline
COPY backend/src ./src
RUN mvn -q -B package -DskipTests

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /build/target/attendance-0.1.0.jar app.jar
ENV JAVA_TOOL_OPTIONS="-Xmx350m -XX:+UseSerialGC"
EXPOSE 8080
# Render supplies $PORT; fall back to 8080 locally.
CMD ["sh", "-c", "java -Dserver.port=${PORT:-8080} -jar app.jar"]
