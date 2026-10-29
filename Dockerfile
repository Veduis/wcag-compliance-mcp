FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY src ./src
COPY data ./data
COPY README.md LICENSE ./
ENTRYPOINT ["node", "src/index.mjs"]
