FROM gradle:8.5-jdk17 AS builder
WORKDIR /app
COPY . .
RUN gradle shadowJar --no-daemon

FROM flink:1.19-java17
COPY --from=builder /app/build/libs/flink-jobs-*-all.jar /opt/flink/usrlib/flink-jobs.jar
