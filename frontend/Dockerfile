FROM node:20-alpine as build-stage

WORKDIR /app

COPY package.json package-lock.json /app/
RUN npm ci

COPY create_dist.js webpack.config.js /app/
COPY src /app/src

ARG API_BASE_URL=http://localhost:5000
ENV API_BASE_URL=$API_BASE_URL
RUN npm run build

# Stage 2: Nginx para servir el bundle estatico
FROM nginxinc/nginx-unprivileged:alpine as prod-stage
COPY --from=build-stage /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
