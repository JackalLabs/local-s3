import {
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const jackalS3 = new S3Client({
  region: "us-east-1", // required
  endpoint: "http://localhost:3010", // 3000 local, 3010 docker
  credentials: {
    accessKeyId: "jackal",
    secretAccessKey: "jackalsecret",
  },
  forcePathStyle: true, // required
});

await jackalS3.send(new CreateBucketCommand({ Bucket: "test_bucket" }));

const putObjectResponse = await jackalS3.send(
  new PutObjectCommand({
    Bucket: "test_bucket",
    Key: "test_key",
    Body: "test_body",
  })
);
console.log("putObjectResponse", putObjectResponse);

const getObjectResponse = await jackalS3.send(
  new GetObjectCommand({ Bucket: "test_bucket", Key: "test_key" })
);
console.log("getObjectResponse", getObjectResponse);
