# Jackal.js S3 Compatible Server

This is an S3-compatible server that wraps the Jackal.js library, enabling you to use S3 clients with Jackal storage.

## Features

- S3-compatible API endpoints
- Base64URL encoding of object names to handle slashes and special characters
- Local authentication via environment variables
- Works with standard S3 clients and libraries

## Supported Endpoints

- CreateBucket - `PUT /:bucket`
- DeleteBucket - `DELETE /:bucket`
- PutObject - `PUT /:bucket/*`
- GetObject - `GET /:bucket/*`
- ListBuckets - `GET /`
- ListObjects - `GET /:bucket`
- HeadBucket - `HEAD /:bucket`
- HeadObject - `HEAD /:bucket/*`

## Setup

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file based on `.env.example`:
   ```
   ACCESS_KEY=your_access_key
   SECRET_KEY=your_secret_key
   JKL_MNEMONIC=your_mnemonic_phrase_here
   PORT=3000
   NETWORK=testnet
   ```
4. Build the project:
   ```
   npm run build
   ```
5. Start the server:
   ```
   npm start
   ```

## Development

For development, you can use the watch mode (currently broken):

```
npm run dev
```

Or you can build the Docker container and then run test scripts
```
export JACKAL_TESTNET_WALLET_MNEMONIC=[your seed]
export JACKAL_MAINNET_WALLET_MNEMONIC=[your seed]
docker build .
docker-compose up
node test.mjs
```

## Using with S3 Clients

You can use any S3-compatible client with this server. Here's an example using the AWS SDK for JavaScript:

```javascript
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

// Create S3 client
const s3Client = new S3Client({
  region: "us-east-1",
  endpoint: "http://localhost:3000",
  credentials: {
    accessKeyId: "your_access_key",
    secretAccessKey: "your_secret_key"
  },
  forcePathStyle: true // Required for non-AWS S3 implementations
});

// Example: Upload a file
async function uploadFile() {
  const params = {
    Bucket: "my-bucket",
    Key: "my-file.txt",
    Body: "Hello, world!"
  };
  
  try {
    const command = new PutObjectCommand(params);
    const response = await s3Client.send(command);
    console.log("File uploaded successfully");
  } catch (err) {
    console.error("Error uploading file:", err);
  }
}

// Example: Download a file
async function downloadFile() {
  const params = {
    Bucket: "my-bucket",
    Key: "my-file.txt"
  };
  
  try {
    const command = new GetObjectCommand(params);
    const response = await s3Client.send(command);
    const content = await response.Body.transformToString();
    console.log("File content:", content);
  } catch (err) {
    console.error("Error downloading file:", err);
  }
}
```

## Limitations

- Advanced query parameters for listing operations are not fully implemented
- This is designed for local usage and has minimal authentication security
- File versioning is not supported
- Multipart uploads are not supported

## License

MIT