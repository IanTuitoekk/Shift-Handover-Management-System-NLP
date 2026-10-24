FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
USER node
EXPOSE 3000
# Bring the database up to date (create it on first run, then migrations), then start the API.
CMD ["sh", "-c", "node scripts/setup-db.js && node bin/www"]
