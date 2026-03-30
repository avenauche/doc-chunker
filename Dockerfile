FROM platformatic/node-caged:25-slim

WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm cache clean --force && npm install --omit=dev --legacy-peer-deps

COPY src/    ./src/
COPY views/  ./views/
COPY public/ ./public/

EXPOSE 3000

CMD ["node", "src/app.js"]
