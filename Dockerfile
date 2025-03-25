FROM node:20-slim

WORKDIR /app

# Copy source
COPY . .

RUN npm i

# Create temp directory
RUN mkdir -p /tmp/jackal-s3

# Expose port
EXPOSE 3000

RUN npm run build

# Run server
CMD ["npm", "start"]