import dotenv from 'dotenv'
import fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fastifyCors from '@fastify/cors'
import { Buffer } from 'buffer'
import { XMLBuilder, XMLParser } from 'fast-xml-parser'
import { Readable } from 'stream'
import { IFileMetaData, IFolderMetaData } from '@jackallabs/jackal.js'

import WebSocket from 'ws'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { Queue } from './queue'
import jjs from '@/jjsPlugin'
import aws4 from 'aws4'

Object.assign(global, { WebSocket: WebSocket })
dotenv.config()

const TEMP_DIR = path.join(os.tmpdir(), 'jackal-s3')
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true })
}

// Environment variables
const PORT = Number(process.env.PORT) || 3000
const ACCESS_KEY = process.env.ACCESS_KEY || 'test'
const SECRET_KEY = process.env.SECRET_KEY || 'test'
const BASE_FOLDER = process.env.BASE_FOLDER || 'S3Buckets'

// Initialize Fastify server
const server: { jjs?: any } & FastifyInstance = fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
  bodyLimit: 32 * 1024 * 1024 * 1024, // 32gb
})

// Add XML content type parser
server.addContentTypeParser('application/xml', { parseAs: 'string' }, (req, body, done) => {
  try {
    // Parse XML to JS object using your XML parser
    const xmlParser = new XMLParser({/* options */ })
    const parsedXml = xmlParser.parse(body)
    done(null, parsedXml)
  } catch (error: any) {
    done(error, undefined)
  }
})

server.addContentTypeParser('application/octet-stream', function (request: any, payload: NodeJS.ReadableStream, done: (err: Error | null, result?: Buffer) => void) {
  const data: Buffer[] = []
  payload.on('data', (chunk: Buffer) => {
    data.push(chunk)
  })
  payload.on('end', () => {
    const buffer = Buffer.concat(data)
    done(null, buffer)
  })
  payload.on('error', (err: Error) => {
    done(err)
  })
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
  payload.on('data', (chunk: Buffer) => {
    data.push(chunk)
  })
  payload.on('end', () => {
    const buffer = Buffer.concat(data)
    done(null, buffer)
  })
  payload.on('error', (err: Error) => {
    done(err)
  })
})

server.register(fastifyCors, {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD'],
})

server.register(jjs)

// XML Builder for S3 responses
const builder = new XMLBuilder({
  ignoreAttributes: false,
  format: true,
  attributeNamePrefix: '@_',
})

function createS3ErrorResponse(code: string, message: string, resource: string = '', requestId: string = ''): string {
  return builder.build({
    Error: {
      Code: code,
      Message: message,
      Resource: resource || null,
      RequestId: requestId || 'jackal-s3-request',
    },
  })
}

const processQueue = new Queue()

// async function openFolder(path: string, count: number = 0): Promise<void> {
//
//   if (count >= 10) {
//     throw new Error(`Failed to open folder after 10 attempts: ${path}`)
//   }
//
//   try {
//     await storageHandler.loadDirectory({ path })
//   } catch (error) {
//     console.log('Failed to load folder, trying again', path)
//     await new Promise(resolve => setTimeout(resolve, 1000))
//     return openFolder(path, count + 1)
//   }
// }

// Utility functions for encoding/decoding object names
// This encoding ensures slashes and special characters don't cause issues
function encodeObjectName(name: string): string {
  return Buffer.from(name).toString('base64url')
}

function decodeObjectName(encodedName: string): string {
  return Buffer.from(encodedName, 'base64url').toString()
}

function extractSig(authorization: string | undefined): string {
  if (authorization === undefined) {
    return '';
  }
  return authorization.split('Signature=')[1];
}

async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    const requestSig = request.headers.authorization;
    const requestObject = request.body as Buffer || {};
    const requestBody = Object.keys(requestObject).length == 0 ? '' : requestObject;
    // filter headers from third-party s3 integrations
    const requestHeaders = Object.fromEntries(Object.entries(request.headers).filter(([k]) => requestSig?.includes(k)));

    // https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html
    const calcBody = aws4.sign({
      hostname: request.hostname,
      method: request.method,
      path: request.url,
      body: requestBody,
      service: 's3',
      headers: requestHeaders,
    }, {
      'accessKeyId': ACCESS_KEY,
      'secretAccessKey': SECRET_KEY
    }).headers;
    const calcSig = calcBody ? calcBody['Authorization']?.toString() : '';

    if (extractSig(requestSig) === extractSig(calcSig)) {
      return;
    }
    // signature mismatch
    console.log(requestSig, calcSig);
    return reply.status(401).send(createS3ErrorResponse('UnauthorizedAccess', 'Invalid credentials'));
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send(createS3ErrorResponse('InternalError', 'Authentication error'));
  }
}

// CreateBucket - Creates a folder in Jackal.js
server.put('/:bucket/', {
  preHandler: authenticate,
}, async (request, reply) => {
  try {
    const { bucket } = request.params as { bucket: string }

    // Create folder
    await server.jjs.loadDirectory({ path: `Home/${BASE_FOLDER}` })
    await processQueue.add(() => server.jjs.createFolders({ names: bucket }))
    await server.jjs.loadDirectory({ path: `Home/${BASE_FOLDER}` })
    await server.jjs.loadDirectory({ path: `Home/${BASE_FOLDER}/${bucket}` })

    reply.status(200).send()
  } catch (err) {
    request.log.error(err)
    reply.status(500).send(createS3ErrorResponse('InternalError', 'Failed to make bucket'))
  }
})

// DeleteBucket - Deletes a folder in Jackal.js
server.delete('/:bucket/', {
  preHandler: authenticate,
}, async (request, reply) => {
  try {
    const { bucket } = request.params as { bucket: string }

    // Delete folder
    await processQueue.add(() => server.jjs.deleteTargets({ targets: `Home/${BASE_FOLDER}/${bucket}` }))

    reply.status(204).send()
  } catch (err) {
    request.log.error(err)
    reply.status(500).send(createS3ErrorResponse('InternalError', 'Failed to delete bucket'))
  }
})

// DeleteObject - Deletes a file in Jackal.js
server.delete('/:bucket/*', {
  preHandler: authenticate,
}, async (request, reply) => {
  try {
    const { bucket } = request.params as { bucket: string }
    const sourceUrl = request.url.split('?')[0]
    const key = sourceUrl.split(`/${bucket}/`)[1]
    // Extract the object key from the URL (everything after the bucket)
    const encodedObjectKey = encodeObjectName(key)

    // Delete file
    await processQueue.add(() => server.jjs.deleteTargets({ targets: `Home/${BASE_FOLDER}/${bucket}/${encodedObjectKey}` }))

    reply.status(204).send()
  } catch (err) {
    request.log.error(err)
    reply.status(500).send(createS3ErrorResponse('InternalError', 'Failed to delete object'))
  }
})


const multiParts: Record<string, number> = {}

// Multipart form upload
server.post('/:bucket/*', {
  preHandler: authenticate,
}, async (request, reply) => {
  try {
    const { bucket } = request.params as { bucket: string }
    const sourceUrl = request.url.split('?')[0]
    const key = sourceUrl.split(`/${bucket}/`)[1]
    const encodedObjectKey = encodeObjectName(key)

    const query = request.query as any
    console.log(query)
    const uploadId = query.uploadId

    if (uploadId) { // completing file upload
      // Make sure the multipart upload exists
      if (!(encodedObjectKey in multiParts)) {
        reply.status(404).send(createS3ErrorResponse('NoSuchUpload', 'Upload does not exist'))
        return
      }

      const count = multiParts[encodedObjectKey]
      const outputFilePath = path.join(TEMP_DIR, `complete-${encodedObjectKey}`)

      // Stream approach for large files
      const writeStream = fs.createWriteStream(outputFilePath)

      try {
        // Process each part sequentially
        for (let i = 1; i <= count; i++) {
          const tempFilePath = path.join(TEMP_DIR, `${i}-${path.basename(encodedObjectKey)}`)

          if (!fs.existsSync(tempFilePath)) {
            throw new Error(`Part ${i} missing: ${tempFilePath}`)
          }

          // Use pipe to efficiently stream each part to the output file
          await new Promise<void>((resolve, reject) => {
            const readStream = fs.createReadStream(tempFilePath)
            readStream.pipe(writeStream, { end: false })
            readStream.on('end', resolve)
            readStream.on('error', reject)
          })
        }

        // Close the write stream
        writeStream.end()

        // Wait for the write to complete
        await new Promise<void>((resolve) => writeStream.on('close', resolve))

        const smallPath = `Home/${BASE_FOLDER}/${bucket}`
        await server.jjs.loadDirectory({ path: smallPath })

        const callback = async () => {
          // Clean up temp files
          for (let i = 1; i <= count; i++) {
            const tempFilePath = path.join(TEMP_DIR, `${i}-${path.basename(encodedObjectKey)}`)
            try {
              fs.unlinkSync(tempFilePath)
            } catch { /* ignore */
            }
          }
          try {
            fs.unlinkSync(outputFilePath)
          } catch { /* ignore */
          }

          // Remove the multipart entry
          delete multiParts[encodedObjectKey]

          reply.status(200).send()
        }

        // Create a BinaryLike object using fs.promises.readFile
        // For large files, you may need to use additional approaches
        // such as streaming through a transformation pipeline
        const fileContent = await fs.promises.readFile(outputFilePath)

        // Create File object for Jackal
        const file = new File(
          [fileContent],
          encodedObjectKey,
          {
            type: request.headers['content-type'] || 'application/octet-stream',
            lastModified: Date.now(),
          },
        )

        console.log('FILE: ', file.size, file.name)

        // Upload file
        await server.jjs.queuePrivate(file)
        await processQueue.add(() => server.jjs.processAllQueues({ callback }))
        await server.jjs.loadDirectory({ path: smallPath })
        return
      } catch (err) {
        writeStream.destroy()
        throw err
      }
    }

    // New file upload
    multiParts[encodedObjectKey] = 0

    const response = builder.build({
      InitiateMultipartUploadResult: {
        '@_xmlns': 'http://s3.amazonaws.com/doc/2006-03-01/',
        Bucket: bucket,
        Key: key,
        UploadId: encodedObjectKey,
      },
    })

    reply.header('Content-Type', 'application/xml')
    reply.send(response)
  } catch (err) {
    request.log.error(err)
    reply.status(500).send(createS3ErrorResponse('InternalError', 'Failed to upload object'))
  }
})

// Upload object
server.put('/:bucket/*', {
  preHandler: authenticate,
}, async (request, reply) => {
  try {
    const { bucket } = request.params as { bucket: string }
    const sourceUrl = request.url.split('?')[0]
    const key = sourceUrl.split(`/${bucket}/`)[1]
    // Extract the object key from the URL (everything after the bucket)
    const encodedObjectKey = encodeObjectName(key)

    const query = request.query as any
    console.log(query)
    const uploadId = query.uploadId
    const partNumber = query.partNumber
    console.log('upload details', uploadId, partNumber)
    if (uploadId) {

      if (encodedObjectKey in multiParts) {
        const count = multiParts[encodedObjectKey]
        multiParts[encodedObjectKey] = count + 1

        // writing part to disk
        const tempFilePath = path.join(TEMP_DIR, `${partNumber}-${path.basename(encodedObjectKey)}`)
        const data = request.body as Buffer
        fs.writeFileSync(tempFilePath, data)

        return
      } else {
        reply.status(500).send(createS3ErrorResponse('InternalError', 'Failed to find upload'))
      }
      return
    }

    const tempFilePath = path.join(TEMP_DIR, `${Date.now()}-${path.basename(encodedObjectKey)}`)

    const data = request.body as Buffer
    fs.writeFileSync(tempFilePath, data)

    const sourceFile = fs.readFileSync(tempFilePath)

    // Create File object for Jackal
    const file = new File(
      [sourceFile],
      encodedObjectKey,
      {
        type: request.headers['content-type'] || 'application/octet-stream',
        lastModified: Date.now(),
      },
    )

    console.log('FILE: ', file.size, file.name)

    // Change directory to the bucket
    const mainPath = `Home/${BASE_FOLDER}/${bucket}`

    await server.jjs.loadDirectory({ path: mainPath })

    const callback = () => {
      reply.status(200).send()
    }

    // Upload file
    await server.jjs.queuePrivate(file)
    await processQueue.add(() => server.jjs.processAllQueues({ callback }))
    await server.jjs.loadDirectory({ path: mainPath })

  } catch (err) {
    request.log.error(err)
    reply.status(500).send(createS3ErrorResponse('InternalError', 'Failed to upload object'))
  }
})

// GetObject - Downloads a file from Jackal.js
server.get('/:bucket/*', {
  preHandler: authenticate,
}, async (request, reply) => {
  try {
    const { bucket } = request.params as { bucket: string }

    const sourceUrl = request.url.split('?')[0]
    const key = sourceUrl.split(`/${bucket}/`)[1]

    const encodedObjectKey = encodeObjectName(key)


    await server.jjs.loadDirectory({ path: `Home/${BASE_FOLDER}/${bucket}` })

    // Construct the path
    const filePath = `Home/${BASE_FOLDER}/${bucket}/${encodedObjectKey}`
    const fileMeta = await server.jjs.getFileMetaData(filePath)

    // Set up download tracker
    const trackers = {
      progress: 0,
      chunks: [],
    }

    // Download file
    const file = await server.jjs.downloadFile(filePath, trackers)


    // Set headers
    reply.header('Content-Type', fileMeta.fileMeta.type || 'application/octet-stream')
    reply.header('Content-Length', fileMeta.fileMeta.size)
    reply.header('Last-Modified', new Date(fileMeta.fileMeta.lastModified).toUTCString())
    reply.header('ETag', `"${fileMeta.fileMeta.lastModified.toString()}"`)

    // Create a readable stream from the file

    const buffer = Buffer.from(await file.arrayBuffer())
    const fileStream = Readable.from(buffer)

    // Stream the file to the response
    return reply.send(fileStream)

    // await pipeline(fileStream, reply.raw);

  } catch (err) {
    request.log.error(err)
    reply.status(404).send(createS3ErrorResponse('NoSuchKey', 'Object not found'))
  }
})

// ListBuckets - Lists folders in Jackal.js
server.get('/', {
  preHandler: authenticate,
}, async (request, reply) => {
  try {
    // Navigate to home
    await server.jjs.loadDirectory({ path: `Home/${BASE_FOLDER}` })

    // Get folder list
    const folders = server.jjs.listChildFolderMetas()

    // Format response as XML
    const buckets = folders.map((folder: IFolderMetaData) => ({
      Name: folder.whoAmI,
      CreationDate: new Date().toISOString(),
    }))

    // Ensure Bucket is always treated as an array
    const bucketsElement = buckets.length === 0 ? { Bucket: [] } :
      buckets.length === 1 ? { Bucket: [buckets[0]] } :
        { Bucket: buckets }

    const response = builder.build({
      ListAllMyBucketsResult: {
        '@_xmlns': 'http://s3.amazonaws.com/doc/2006-03-01/',
        Owner: {
          ID: ACCESS_KEY,
          DisplayName: 'Jackal.js S3 Adapter',
        },
        Buckets: bucketsElement,
      },
    })

    reply.header('Content-Type', 'application/xml')
    reply.send(response)
  } catch (err) {
    request.log.error(err)
    reply.status(500).send(createS3ErrorResponse('InternalError', 'Failed to list buckets'))
  }
})

// ListObjects (V1) and ListObjectsV2 handler
server.get('/:bucket/', {
  preHandler: authenticate,
}, async (request, reply) => {
  try {
    const { bucket } = request.params as { bucket: string }
    const query = request.query as any

    // Handle versioning query
    if ('versioning' in query) {
      const response = builder.build({
        VersioningConfiguration: {
          '@_xmlns': 'http://s3.amazonaws.com/doc/2006-03-01/',
          Status: 'Suspended', // Or 'Enabled' if you plan to support versioning
        },
      })

      reply.header('Content-Type', 'application/xml')
      return reply.send(response)
    }

    // Determine if this is a V1 or V2 request
    const isV2 = 'list-type' in query && query['list-type'] === '2'

    // Common parameters
    const delimiter = query.delimiter || ''
    const encodingType = query['encoding-type'] || null
    const maxKeys = parseInt(query['max-keys'] || '1000', 10)
    const prefix = query.prefix || ''

    // V1 specific
    const marker = query.marker || ''

    // V2 specific
    const continuationToken = query['continuation-token'] || ''
    const startAfter = query['start-after'] || ''
    const fetchOwner = query['fetch-owner'] === 'true'

    // Navigate to the bucket
    await server.jjs.loadDirectory({ path: `Home/${BASE_FOLDER}/${bucket}` })

    // Get files and folders
    const files = server.jjs.listChildFileMetas()
    const folders = server.jjs.listChildFolderMetas()

    // Filter by prefix if specified
    const filteredFiles = files.filter((file: IFileMetaData) => {
      const key = decodeObjectName(file.fileMeta.name)
      return key.startsWith(prefix)
    })

    // Format common response elements
    const contents = filteredFiles.map((file: IFileMetaData) => {
      const key = decodeObjectName(file.fileMeta.name)
      return {
        Key: key,
        LastModified: new Date(file.fileMeta.lastModified).toISOString(),
        ETag: `"${file.fileMeta.lastModified.toString()}"`,
        Size: file.fileMeta.size.toString(),
        StorageClass: 'STANDARD',
        ...(fetchOwner ? {
          Owner: {
            ID: ACCESS_KEY,
            DisplayName: 'Jackal.js S3 Adapter',
          },
        } : {}),
      }
    })

    // Handle prefixes and delimiters (common folders)
    const commonPrefixes = []
    if (delimiter) {
      const prefixSet = new Set()

      // Check folders for common prefixes
      for (const folder of folders) {
        const folderKey = folder.whoAmI + delimiter
        if (folderKey.startsWith(prefix)) {
          const prefixPart = folderKey.substring(0, folderKey.indexOf(delimiter, prefix.length) + 1)
          if (prefixPart !== prefix) {
            prefixSet.add(prefixPart)
          }
        }
      }

      // Add common prefixes to result
      for (const prefix of prefixSet) {
        commonPrefixes.push({ Prefix: prefix })
      }
    }

    // V1 response
    if (!isV2) {
      const response = builder.build({
        ListBucketResult: {
          '@_xmlns': 'http://s3.amazonaws.com/doc/2006-03-01/',
          Name: bucket,
          Prefix: prefix,
          Marker: marker,
          MaxKeys: maxKeys,
          Delimiter: delimiter || null,
          IsTruncated: false, // Simplified - we don't handle pagination yet
          Contents: contents.length > 0 ? (contents.length === 1 ? [contents[0]] : contents) : [],
          CommonPrefixes: commonPrefixes.length > 0 ? commonPrefixes : [],
        },
      })

      reply.header('Content-Type', 'application/xml')
      return reply.send(response)
    }

    // V2 response
    const response = builder.build({
      ListBucketResult: {
        '@_xmlns': 'http://s3.amazonaws.com/doc/2006-03-01/',
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
        CommonPrefixes: commonPrefixes.length > 0 ? commonPrefixes : [],
      },
    })

    reply.header('Content-Type', 'application/xml')
    return reply.send(response)
  } catch (err) {
    request.log.error(err)
    reply.status(500).send(createS3ErrorResponse('InternalError', 'Failed to list objects'))
  }
})

// HeadBucket - Checks if a bucket exists
server.head('/:bucket/', {
  preHandler: authenticate,
}, async (request, reply) => {
  try {
    const { bucket } = request.params as { bucket: string }

    // Try to navigate to the bucket
    await server.jjs.loadDirectory({ path: `Home/${BASE_FOLDER}/${bucket}` })

    reply.status(200).send()
  } catch {
    reply.status(404).send()
  }
})

// HeadObject - Checks if an object exists
server.head('/:bucket/*', {
  preHandler: authenticate,
}, async (request, reply) => {
  try {
    const { bucket } = request.params as { bucket: string }

    const key = request.url.split(`/${bucket}/`)[1]
    const encodedObjectKey = encodeObjectName(key)

    // Construct the path
    const filePath = `Home/${BASE_FOLDER}/${bucket}/${encodedObjectKey}`

    // Get file metadata
    const fileMeta = await server.jjs.getFileMetaData(filePath)

    reply.header('Content-Type', fileMeta.fileMeta.type || 'application/octet-stream')
    reply.header('Content-Length', fileMeta.fileMeta.size.toString())
    reply.header('Last-Modified', new Date(fileMeta.fileMeta.lastModified).toUTCString())
    reply.header('ETag', `"${fileMeta.fileMeta.lastModified.toString()}"`)
    reply.status(200).send()
  } catch {
    reply.status(404).send()
  }
})

// Start the server
async function start() {
  try {
    await server.listen({ port: PORT, host: '0.0.0.0' })
    console.log(`S3-compatible server running on port ${PORT}`)
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

start()
