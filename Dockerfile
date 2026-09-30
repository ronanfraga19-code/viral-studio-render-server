FROM node:20-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY motor-cloud.js ./motor-cloud.js
ENV PORT=10000
EXPOSE 10000
CMD ["node","motor-cloud.js"]
