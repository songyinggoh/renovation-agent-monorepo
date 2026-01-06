# Use the official Node.js image.
# https://hub.docker.com/_/node
FROM node:latest

# Create and change to the app directory.
WORKDIR /usr/src/app

# Copy application dependency manifests to the container image.
COPY package*.json ./

# Install dependencies.
RUN npm install

# Copy local code to the container image.
COPY . .

# Copy the .env file to the container image.
# COPY .env .env

# Build the TypeScript code.
RUN npm run build

# Run the web service on container startup.
CMD [ "npm", "start" ]
