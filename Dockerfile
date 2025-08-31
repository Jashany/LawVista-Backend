FROM node:20-alpine
WORKDIR /home/node/app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
EXPOSE 3000
CMD ["pm2-runtime", "index.js"]