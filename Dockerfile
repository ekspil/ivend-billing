FROM node:11
RUN mkdir -p /app/app
COPY app /app/app
COPY app.js /app
COPY package-lock.json /app
COPY package.json /app
WORKDIR /app
RUN npm install
CMD ["node", "/app/app.js"]
