import {
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const jackalS3 = new S3Client({
  region: "us-east-1", // required
  endpoint: "http://localhost:3000", // 3000 local, 3010 docker
  credentials: {
    accessKeyId: "jackal",
    secretAccessKey: "jackalsecret",
  },
  forcePathStyle: true, // required
});

const createBucketResponse = await jackalS3.send(
  new CreateBucketCommand({ Bucket: "test_bucket" })
);
console.log("createBucketResponse", createBucketResponse);

const putObjectResponse = await jackalS3.send(
  new PutObjectCommand({
    Bucket: "test_bucket",
    Key: "test_key",
    Body: "test_body",
  })
);
console.log("putObjectResponse", putObjectResponse);

setTimeout(async () => {
  const getObjectResponse = await jackalS3.send(
    new GetObjectCommand({ Bucket: "test_bucket", Key: "test_key" })
  );
  console.log("getObjectResponse", getObjectResponse);
  console.log(await getObjectResponse.Body.transformToString());
}, 300 * 1000);
