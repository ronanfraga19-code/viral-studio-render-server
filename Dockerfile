FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY requirements.txt ./
RUN pip3 install --break-system-packages --no-cache-dir -r requirements.txt
COPY server.js tts.py ./
ENV PORT=10000
EXPOSE 10000
CMD ["npm","start"]
