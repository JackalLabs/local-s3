import {config} from 'dotenv';
import fastify, {FastifyReply, FastifyRequest} from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import fastifyCors from '@fastify/cors';
import {ClientHandler, IClientHandler, IStorageHandler, StorageHandler} from '@jackallabs/jackal.js';
import {Buffer} from 'buffer';
import {XMLBuilder, XMLParser} from 'fast-xml-parser';
import {Readable} from 'stream';
import {mainnet} from './utils';

import WebSocket from 'ws';
import path from "path";
import fs from "fs";
import os from "os";
import {Queue} from "./queue";

Object.assign(global, { WebSocket: WebSocket });
// Load environment variables
config();

const TEMP_DIR = path.join(os.tmpdir(), 'jackal-s3');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

const initPool = {
    // jkl1h7mssuydzhgc3jwwrvu922cau9jnd0akzp7n0u: "https://node1.jackalstorageprovider40.com",
    // jkl10kvlcwwntw2nyccz4hlgl7ltp2gyvvfrtae5x6: "https://pod-04.jackalstorage.online",
    // jkl10nf7agseed0yrke6j79xpzattkjdvdrpls3g22: "https://pod-01.jackalstorage.online",
    jkl1t5708690gf9rc3mmtgcjmn9padl8va5g03f9wm: "https://mprov01.jackallabs.io",
    jkl1esjprqperjzwspaz6er7azzgqkvsa6n5kljv05: "https://mprov02.jackallabs.io",
    // jkl10de5s5ylu0ve0zqh9cx7k908j4hsu0rmqrld6e: "https://pod2.europlots.net",
    jkl1dht8meprya6jr7w9g9zcp4p98ccxvckufvu4zc: "https://jklstorage1.squirrellogic.com",
    jkl1nfnmjk7k59xc3q7wgtva7xahkg3ltjtgs3le93: "https://jklstorage2.squirrellogic.com",
}

// Environment variables
const PORT = parseInt(process.env.PORT || '3000', 10);
const ACCESS_KEY = process.env.ACCESS_KEY || 'test';
const SECRET_KEY = process.env.SECRET_KEY || 'test';
const JKL_MNEMONIC = process.env.JKL_MNEMONIC || '';
const BASE_FOLDER = 'S3Buckets'

if (!JKL_MNEMONIC) {
    console.error('JKL_MNEMONIC environment variable is required');
    process.exit(1);
}

// Initialize Fastify server
const server = fastify({
    logger: {
        transport: {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname'
            }
        }
    },
    bodyLimit: 32 * 1024 * 1024 * 1024, // 32gb
});

// Add XML content type parser
server.addContentTypeParser('application/xml', { parseAs: 'string' }, (req, body, done) => {
    try {
        // Parse XML to JS object using your XML parser
        const xmlParser = new XMLParser({/* options */});
        const parsedXml = xmlParser.parse(body);
        done(null, parsedXml);
    } catch (error: any) {
        done(error, undefined);
    }
});

server.addContentTypeParser('application/octet-stream', function (request: any, payload: NodeJS.ReadableStream, done: (err: Error | null, result?: Buffer) => void) {
    const data: Buffer[] = []
    payload.on('data', (chunk: Buffer) => { data.push(chunk) })
    payload.on('end', () => {
        const buffer = Buffer.concat(data)
        done(null, buffer)
    })
    payload.on('error', (err: Error) => { done(err) })
})

server.addContentTypeParser('*', function (request, payload, done) {
    // Skip if we have a specialized handler for this content type
    if (!request.headers['content-type']) {
        done(null)
        return
    }

    if (server.hasContentTypeParser(request.headers['content-type'])) {
        done(null)
        return
    }

    const data: Buffer[] = []
    payload.on('data', chunk => { data.push(chunk) })
    payload.on('end', () => {
        const buffer = Buffer.concat(data)
        done(null, buffer)
    })
    payload.on('error', err => { done(err) })
})

server.register(fastifyMultipart, {
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB
    }
});
server.register(fastifyCors, {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD']
});

// XML Builder for S3 responses
const builder = new XMLBuilder({
    ignoreAttributes: false,
    format: true,
    attributeNamePrefix: "@_"
});

function createS3ErrorResponse(code: string, message: string, resource: string = '', requestId: string = ''): string {
    return builder.build({
        Error: {
            Code: code,
            Message: message,
            Resource: resource || null,
            RequestId: requestId || 'jackal-s3-request'
        }
    });
}

const q = new Queue();

async function openFolder(path: string, count: number = 0): Promise<void> {

    if (count >= 10) {
        throw new Error(`Failed to open folder after 10 attempts: ${path}`);
    }

    try {
        await storageHandler.loadDirectory({ path });
    } catch (error) {
        console.error(error)
        console.log("Failed to load folder, trying again", path);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return openFolder(path, count + 1);
    }
}

// Utility functions for encoding/decoding object names
// This encoding ensures slashes and special characters don't cause issues
function encodeObjectName(name: string): string {
    return Buffer.from(name).toString('base64url');
}

function decodeObjectName(encodedName: string): string {
    return Buffer.from(encodedName, 'base64url').toString();
}

// Initialize Jackal.js client and storage handler
let clientHandler: IClientHandler;
let storageHandler: IStorageHandler;

async function initJackalClients() {
    try {
        clientHandler = await ClientHandler.connect({
            ...mainnet,
            selectedWallet: 'mnemonic',
            mnemonic: JKL_MNEMONIC
        });

        storageHandler = await StorageHandler.init(clientHandler, {
            setFullSigner: true
        });

        // Initialize storage if needed
        await storageHandler.initStorage();
        try {
            await openFolder(`Home/${BASE_FOLDER}`);
        } catch (err) {
            console.log(`Creating storage root: ${BASE_FOLDER}`);
            // Create S3 root folder
            await storageHandler.createFolders({ names: BASE_FOLDER });
            await openFolder("Home");
        }


        await storageHandler.loadProviderPool(initPool)

        console.log('Jackal.js client initialized successfully');
    } catch (error) {
        console.error('Failed to initialize Jackal.js client:', error);
        process.exit(1);
    }
}


async function authenticate(request: FastifyRequest, reply: FastifyReply) {
    return
    // try {
    //     const authHeader = request.headers.authorization;
    //
    //     // Log entire headers for debugging
    //     console.log("Request headers:", request.headers);
    //
    //     if (!authHeader) {
    //         // Allow anonymous access for initial bucket operations from Restic
    //         if (request.method === 'HEAD' || request.method === 'GET') {
    //             return;
    //         }
    //         return reply.status(401).send({ error: 'Missing authorization header' });
    //     }
    //
    //     if (authHeader.includes(ACCESS_KEY)) {
    //         return;
    //     }
    //
    //     return reply.status(403).send({ error: 'Invalid authorization' });
    // } catch (error) {
    //     request.log.error(error);
    //     return reply.status(500).send({ error: 'Authentication error' });
    // }
}

// S3 Compatible API endpoints

// CreateBucket - Creates a folder in Jackal.js
server.put('/:bucket/', {
    preHandler: authenticate
}, async (request, reply) => {
    try {
        const { bucket } = request.params as { bucket: string };

        // Create folder
        await openFolder(`Home/${BASE_FOLDER}`)
        await q.add(() => storageHandler.createFolders({names: bucket}))
        await openFolder( `Home/${BASE_FOLDER}`)
        await openFolder( `Home/${BASE_FOLDER}/${bucket}`)

        reply.status(200).send();
    } catch (error) {
        request.log.error(error);
        reply.status(500).send(createS3ErrorResponse("InternalError", "Failed to make bucket"));
    }
});

// DeleteBucket - Deletes a folder in Jackal.js
server.delete('/:bucket/', {
    preHandler: authenticate
}, async (request, reply) => {
    try {
        const { bucket } = request.params as { bucket: string };

        // Delete folder
        await q.add(() => storageHandler.deleteTargets({ targets: `Home/${BASE_FOLDER}/${bucket}`} ));

        reply.status(204).send();
    } catch (error) {
        request.log.error(error);
        reply.status(500).send(createS3ErrorResponse("InternalError", "Failed to delete bucket"));
    }
});

// DeleteObject - Deletes a file in Jackal.js
server.delete('/:bucket/*', {
    preHandler: authenticate
}, async (request, reply) => {
    try {
        const { bucket } = request.params as { bucket: string };
        const u = request.url.split("?")[0]
        const key = u.split(`/${bucket}/`)[1];
        // Extract the object key from the URL (everything after the bucket)
        const encodedObjectKey = encodeObjectName(key);

        // Delete file
        await q.add(() => storageHandler.deleteTargets({ targets: `Home/${BASE_FOLDER}/${bucket}/${encodedObjectKey}` } ));

        reply.status(204).send();
    } catch (error) {
        request.log.error(error);
        reply.status(500).send(createS3ErrorResponse("InternalError", "Failed to delete object"));
    }
});



const multiParts: Record<string, number> = {}

// Multipart form upload
server.post('/:bucket/*', {
    preHandler: authenticate
}, async (request, reply) => {
    try {
        const { bucket } = request.params as { bucket: string };
        const u = request.url.split("?")[0];
        const key = u.split(`/${bucket}/`)[1];
        const encodedObjectKey = encodeObjectName(key);

        const query = request.query as any;
        console.log(query);
        const uploadId = query.uploadId;

        if (uploadId) { // completing file upload
            // Make sure the multipart upload exists
            if (!(encodedObjectKey in multiParts)) {
                reply.status(404).send(createS3ErrorResponse("NoSuchUpload", "Upload does not exist"));
                return;
            }

            const count = multiParts[encodedObjectKey];

            // Change directory to the bucket
            const p = `Home/${BASE_FOLDER}/${bucket}`;
            await openFolder(p);

            const k = async () => {
                // Clean up temp files
                for (let i = 1; i <= count; i++) {
                    const tempFilePath = path.join(TEMP_DIR, `${i}-${path.basename(encodedObjectKey)}`);
                    try { fs.unlinkSync(tempFilePath); } catch (e) { /* ignore */ }
                }

                // Remove the multipart entry
                delete multiParts[encodedObjectKey];

                reply.status(200).send();
            };

            for (let i = 1; i <= count; i++) {
                const tempFilePath = path.join(TEMP_DIR, `${i}-${path.basename(encodedObjectKey)}`);
                if (!fs.existsSync(tempFilePath)) {
                    throw new Error(`Part ${i} missing: ${tempFilePath}`);
                }
            }

            // Create a File object with a blob iterator that will load chunks as needed
            const blobParts: Blob[] = [];

            // Add each part as a Blob
            for (let i = 1; i <= count; i++) {
                const tempFilePath = path.join(TEMP_DIR, `${i}-${path.basename(encodedObjectKey)}`);
                const partData = await fs.promises.readFile(tempFilePath);
                blobParts.push(new Blob([partData]));
            }

            console.log("blob array created successfully...");

            // Create a single Blob from all parts
            const fileBlob = new Blob(blobParts, {
                type: request.headers['content-type'] || 'application/octet-stream'
            });

            console.log("blob finalized...");


            // Create the File object
            const file = new File(
                [fileBlob],
                encodedObjectKey,
                {
                    type: request.headers['content-type'] || 'application/octet-stream',
                    lastModified: Date.now()
                }
            );

            console.log("FILE: ", file.size, file.name);

            // Upload file
            await storageHandler.queuePrivate(file);
            await q.add(() => storageHandler.processAllQueues({callback: k}));
            await storageHandler.loadDirectory({path: p});
            return;
        }

        // New file upload
        multiParts[encodedObjectKey] = 0;

        const response = builder.build({
            InitiateMultipartUploadResult: {
                "@_xmlns": 'http://s3.amazonaws.com/doc/2006-03-01/',
                Bucket: bucket,
                Key: key,
                UploadId: encodedObjectKey,
            }
        });

        reply.header('Content-Type', 'application/xml');
        reply.send(response);
    } catch (error) {
        request.log.error(error);
        reply.status(500).send(createS3ErrorResponse("InternalError", "Failed to upload object"));
    }
});

// Upload object
server.put('/:bucket/*', {
    preHandler: authenticate
}, async (request, reply) => {
    try {
        const { bucket } = request.params as { bucket: string };
        const u = request.url.split("?")[0]
        const key = u.split(`/${bucket}/`)[1];
        // Extract the object key from the URL (everything after the bucket)
        const encodedObjectKey = encodeObjectName(key);

        const query = request.query as any;
        console.log(query)
        const uploadId = query.uploadId;
        const partNumber = query.partNumber;
        console.log("upload details", uploadId, partNumber)
        if (uploadId) {

            if (encodedObjectKey in multiParts) {
                const count = multiParts[encodedObjectKey];
                multiParts[encodedObjectKey] = count + 1

                // writing part to disk
                const tempFilePath = path.join(TEMP_DIR, `${partNumber}-${path.basename(encodedObjectKey)}`);
                const data = request.body as Buffer;
                fs.writeFileSync(tempFilePath, data);

                return
            } else {
                reply.status(500).send(createS3ErrorResponse("InternalError", "Failed to find upload"));
            }
            return
        }

        const tempFilePath = path.join(TEMP_DIR, `${Date.now()}-${path.basename(encodedObjectKey)}`);

        const data = request.body as Buffer;
        fs.writeFileSync(tempFilePath, data);

        const f = fs.readFileSync(tempFilePath)

        // Create File object for Jackal
        const file = new File(
            [f],
            encodedObjectKey,
            {
                type: request.headers['content-type'] || 'application/octet-stream',
                lastModified: Date.now()
            }
        );

        console.log("FILE: ", file.size, file.name)

        // Change directory to the bucket
        const p = `Home/${BASE_FOLDER}/${bucket}`

        await openFolder(p);

        const k = () => {
            reply.status(200).send()
        }

        // Upload file
        await storageHandler.queuePrivate(file)
        await q.add(() => storageHandler.processAllQueues({callback: k}))
        await storageHandler.loadDirectory({path: p})

    } catch (error) {
        request.log.error(error);
        reply.status(500).send(createS3ErrorResponse("InternalError", "Failed to upload object"));
    }
});

// GetObject - Downloads a file from Jackal.js
server.get('/:bucket/*', {
    preHandler: authenticate
}, async (request, reply) => {
    try {
        const { bucket } = request.params as { bucket: string };

        const u = request.url.split("?")[0]
        const key = u.split(`/${bucket}/`)[1];

        const encodedObjectKey = encodeObjectName(key);


        await openFolder( `Home/${BASE_FOLDER}/${bucket}`)

        // Construct the path
        const filePath = `Home/${BASE_FOLDER}/${bucket}/${encodedObjectKey}`;
        const fileMeta = await storageHandler.getFileMetaData(filePath);

        // Set up download tracker
        const trackers = {
            progress: 0,
            chunks: []
        };

        // Download file
        const file = await storageHandler.downloadFile(filePath, trackers);


        // Set headers
        reply.header('Content-Type', fileMeta.fileMeta.type || 'application/octet-stream');
        reply.header('Content-Length', fileMeta.fileMeta.size);
        reply.header('Last-Modified', new Date(fileMeta.fileMeta.lastModified).toUTCString());
        reply.header('ETag', `"${fileMeta.fileMeta.lastModified.toString()}"`);

        // Create a readable stream from the file

        const buffer = Buffer.from(await file.arrayBuffer());
        const fileStream = Readable.from(buffer);

        // Stream the file to the response
        return reply.send(fileStream);

        // await pipeline(fileStream, reply.raw);

    } catch (error) {
        request.log.error(error);
        reply.status(404).send(createS3ErrorResponse("NoSuchKey", "Object not found"));
    }
});

// ListBuckets - Lists folders in Jackal.js
server.get('/', {
    preHandler: authenticate
}, async (request, reply) => {
    try {
        // Navigate to home
        await openFolder(`Home/${BASE_FOLDER}`);

        // Get folder list
        const folders = storageHandler.listChildFolderMetas();

        // Format response as XML
        const buckets = folders.map(folder => ({
            Name: folder.whoAmI,
            CreationDate: new Date().toISOString()
        }));

        // Ensure Bucket is always treated as an array
        const bucketsElement = buckets.length === 0 ? { Bucket: [] } :
            buckets.length === 1 ? { Bucket: [buckets[0]] } :
                { Bucket: buckets };

        const response = builder.build({
            ListAllMyBucketsResult: {
                "@_xmlns": 'http://s3.amazonaws.com/doc/2006-03-01/',
                Owner: {
                    ID: ACCESS_KEY,
                    DisplayName: 'Jackal.js S3 Adapter'
                },
                Buckets: bucketsElement
            }
        });

        reply.header('Content-Type', 'application/xml');
        reply.send(response);
    } catch (error) {
        request.log.error(error);
        reply.status(500).send(createS3ErrorResponse("InternalError", "Failed to list buckets"));
    }
});

// ListObjects (V1) and ListObjectsV2 handler
server.get('/:bucket/', {
    preHandler: authenticate
}, async (request, reply) => {
    try {
        const { bucket } = request.params as { bucket: string };
        const query = request.query as any;

        // Handle versioning query
        if ('versioning' in query) {
            const response = builder.build({
                VersioningConfiguration: {
                    "@_xmlns": 'http://s3.amazonaws.com/doc/2006-03-01/',
                    Status: 'Suspended' // Or 'Enabled' if you plan to support versioning
                }
            });

            reply.header('Content-Type', 'application/xml');
            return reply.send(response);
        }

        // Determine if this is a V1 or V2 request
        const isV2 = 'list-type' in query && query['list-type'] === '2';

        // Common parameters
        const delimiter = query.delimiter || '';
        const encodingType = query['encoding-type'] || null;
        const maxKeys = parseInt(query['max-keys'] || '1000', 10);
        const prefix = query.prefix || '';

        // V1 specific
        const marker = query.marker || '';

        // V2 specific
        const continuationToken = query['continuation-token'] || '';
        const startAfter = query['start-after'] || '';
        const fetchOwner = query['fetch-owner'] === 'true';

        // Navigate to the bucket
        await openFolder(`Home/${BASE_FOLDER}/${bucket}`);

        // Get files and folders
        const files = storageHandler.listChildFileMetas();
        const folders = storageHandler.listChildFolderMetas();

        // Filter by prefix if specified
        const filteredFiles = files.filter(file => {
            const key = decodeObjectName(file.fileMeta.name);
            return key.startsWith(prefix);
        });

        // Format common response elements
        const contents = filteredFiles.map(file => {
            const key = decodeObjectName(file.fileMeta.name);
            return {
                Key: key,
                LastModified: new Date(file.fileMeta.lastModified).toISOString(),
                ETag: `"${file.fileMeta.lastModified.toString()}"`,
                Size: file.fileMeta.size.toString(),
                StorageClass: 'STANDARD',
                ...(fetchOwner ? {
                    Owner: {
                        ID: ACCESS_KEY,
                        DisplayName: 'Jackal.js S3 Adapter'
                    }
                } : {})
            };
        });

        // Handle prefixes and delimiters (common folders)
        const commonPrefixes = [];
        if (delimiter) {
            const prefixSet = new Set();

            // Check folders for common prefixes
            for (const folder of folders) {
                const folderKey = folder.whoAmI + delimiter;
                if (folderKey.startsWith(prefix)) {
                    const prefixPart = folderKey.substring(0, folderKey.indexOf(delimiter, prefix.length) + 1);
                    if (prefixPart !== prefix) {
                        prefixSet.add(prefixPart);
                    }
                }
            }

            // Add common prefixes to result
            for (const prefix of prefixSet) {
                commonPrefixes.push({ Prefix: prefix });
            }
        }

        // V1 response
        if (!isV2) {
            const response = builder.build({
                ListBucketResult: {
                    "@_xmlns": 'http://s3.amazonaws.com/doc/2006-03-01/',
                    Name: bucket,
                    Prefix: prefix,
                    Marker: marker,
                    MaxKeys: maxKeys,
                    Delimiter: delimiter || null,
                    IsTruncated: false, // Simplified - we don't handle pagination yet
                    Contents: contents.length > 0 ? (contents.length === 1 ? [contents[0]] : contents) : [],
                    CommonPrefixes: commonPrefixes.length > 0 ? commonPrefixes : []
                }
            });

            reply.header('Content-Type', 'application/xml');
            return reply.send(response);
        }

        // V2 response
        const response = builder.build({
            ListBucketResult: {
                "@_xmlns": 'http://s3.amazonaws.com/doc/2006-03-01/',
                Name: bucket,
                Prefix: prefix,
                StartAfter: startAfter,
                MaxKeys: maxKeys,
                Delimiter: delimiter || null,
                IsTruncated: false, // Simplified - we don't handle pagination yet
                KeyCount: contents.length,
                ContinuationToken: continuationToken || null,
                NextContinuationToken: null, // No pagination for now
                Contents: contents.length > 0 ? (contents.length === 1 ? [contents[0]] : contents) : [],
                CommonPrefixes: commonPrefixes.length > 0 ? commonPrefixes : []
            }
        });

        reply.header('Content-Type', 'application/xml');
        return reply.send(response);
    } catch (error) {
        request.log.error(error);
        reply.status(500).send(createS3ErrorResponse("InternalError", "Failed to list objects"));
    }
});

// HeadBucket - Checks if a bucket exists
server.head('/:bucket/', {
    preHandler: authenticate
}, async (request, reply) => {
    try {
        const { bucket } = request.params as { bucket: string };

        // Try to navigate to the bucket
        await openFolder(`Home/${BASE_FOLDER}/${bucket}`);

        reply.status(200).send();
    } catch (error) {
        reply.status(404).send();
    }
});

// HeadObject - Checks if an object exists
server.head('/:bucket/*', {
    preHandler: authenticate
}, async (request, reply) => {
    try {
        const { bucket } = request.params as { bucket: string };

        const key = request.url.split(`/${bucket}/`)[1];
        const encodedObjectKey = encodeObjectName(key);

        // Construct the path
        const filePath = `Home/${BASE_FOLDER}/${bucket}/${encodedObjectKey}`;

        // Get file metadata
        const fileMeta = await storageHandler.getFileMetaData(filePath);

        reply.header('Content-Type', fileMeta.fileMeta.type || 'application/octet-stream');
        reply.header('Content-Length', fileMeta.fileMeta.size.toString());
        reply.header('Last-Modified', new Date(fileMeta.fileMeta.lastModified).toUTCString());
        reply.header('ETag', `"${fileMeta.fileMeta.lastModified.toString()}"`);
        reply.status(200).send();
    } catch (error) {
        reply.status(404).send();
    }
});

// Start the server
async function start() {
    try {
        // Initialize Jackal.js client
        await initJackalClients();

        // Start the Fastify server
        await server.listen({ port: PORT, host: '0.0.0.0' });
        console.log(`S3-compatible server running on port ${PORT}`);
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
}

start();