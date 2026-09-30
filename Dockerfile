FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
ENV PORT=10000
ENV MAX_CONCURRENCY=1
EXPOSE 10000
CMD ["node","motor-cloud.js"]
