// Import required modules
import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import caseRouter from './routes/case.routes.js';
import authRouter from './routes/auth.routes.js';
import noteBookRouter from './routes/notebook.routes.js';
import chatRouter from './routes/chat.routes.js';
import docRouter from './routes/doc.routes.js';
import axios from 'axios';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import Case from './models/case.model.js';
import * as cheerio from 'cheerio';

// Import security middlewares
import {
    generalLimiter,
    authLimiter,
    passwordResetLimiter,
    chatLimiter,
    uploadLimiter,
    speedLimiter,
    helmetConfig,
    mongoSanitizer,
    hppProtection,
    customSecurityHeaders,
    requestSizeLimiter,
    corsOptions,
    securityLogger,
    securityErrorHandler
} from './middlewares/security.js';



dotenv.config();

const app = express();

const r2Client = new S3Client({
    region: 'apac',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY, // Replace with your R2 Access Key
        secretAccessKey: process.env.R2_ACCESS_KEY, // Replace with your R2 Secret Key
    },
});

const uploadToR2 = async (bucket, key, content, contentType) => {
    const params = {
        Bucket: bucket,
        Key: key,
        Body: content,
        ContentType: contentType,
    };
    await r2Client.send(new PutObjectCommand(params));
    return `R2_ENDPOINT/${key}`; // Replace with your R2 public URL format
};

// Middleware setup
// Trust proxy for accurate IP addresses behind reverse proxies
app.set('trust proxy', 1);

// Security headers
app.use(helmetConfig);
app.use(customSecurityHeaders);

// Request logging and monitoring
app.use(securityLogger);

// Request size limiting
app.use(requestSizeLimiter);

// MongoDB injection protection
app.use(mongoSanitizer);

// HTTP Parameter Pollution protection
app.use(hppProtection);

// General rate limiting and speed control
app.use(generalLimiter);
app.use(speedLimiter);

// Parse incoming JSON requests with size limit
app.use(express.json({ limit: '10mb' })); 
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Enable CORS with security configurations
app.use(cors(corsOptions));

// Parse cookies
app.use(cookieParser());


// Routes with specific rate limiting
app.use('/api/cases', caseRouter);
app.use("/api/auth", authLimiter, authRouter);
app.use("/api/chat", chatLimiter, chatRouter);
app.use("/api/notebook", noteBookRouter);
app.use("/api/doc", docRouter);

// Upload endpoint with specific rate limiting
app.get('/upload/:docid', uploadLimiter, async (req, res) => {
    const { docid } = req.params;
    const baseUrl = `https://indiankanoon.org/doc/${docid}/`;

    try {
        const response = await axios.get(baseUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
            },
        });

        const $ = cheerio.load(response.data);

        // Remove ad elements
        $('div.ad_doc').remove();

        // Extract judgment text
        const judgmentsDiv = $('div.judgments');
        let judgmentText = '';

        if (judgmentsDiv.length) {
            judgmentsDiv.children().each((_, element) => {
                if ($(element).is('pre')) {
                    judgmentText += `<pre>${$(element).text().trim()}</pre><br />`;
                } else {
                    judgmentText += `${$(element).text().trim()}<br />`;
                }
            });
        } else {
            judgmentText = 'Not Found';
        }

        // Upload judgment text to R2
        const judgmentKey = `judgmenttxts/${docid}.txt`;
        const judgmentUrl = await uploadToR2('jsondev', judgmentKey, judgmentText, 'text/plain');

        // Download PDF and upload to R2
        const pdfResponse = await axios.post(baseUrl, new URLSearchParams({ type: 'pdf' }), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0',
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            responseType: 'arraybuffer',
        });

        if (pdfResponse.headers['content-type'] === 'application/pdf') {
            const pdfKey = `case_pdfs/case_${docid}.pdf`;
            const pdfUrl = await uploadToR2('jsondev', pdfKey, pdfResponse.data, 'application/pdf');

            const caseDetails = {
                Case_id: docid,
                Case_Title: $('h2.doc_title').text().trim() || 'Not Found',
                Court_Name: $('h2.docsource_main').text().trim() || 'Not Found',
                Judgment_Author: $('h3.doc_author a').text().trim() || 'Not Found',
                Bench: $('h3.doc_bench a').text().trim() || 'Not Found',
                Citations: $('h3.doc_citations').text().split(':').pop().trim() || 'Not Found',
                Issues: $('p[data-structure="Issue"]').map((_, el) => $(el).text().trim()).get(),
                Facts: $('p[data-structure="Facts"]').map((_, el) => $(el).text().trim()).get(),
                Conclusions: $('p[data-structure="Conclusion"]').map((_, el) => $(el).text().trim()).get(),
                PDF_Path: pdfKey,
                Judgment_Path: judgmentKey,
            };

            // Save to MongoDB
            await Case.create(caseDetails);

            res.json(caseDetails);
        } else {
            throw new Error('PDF response is not valid');
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 404 handler for undefined routes
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Security error handler
app.use(securityErrorHandler);

// Connect to MongoDB
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URL, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('MongoDB connected');
    } catch (error) {
        console.error('MongoDB connection error:', error.message);
        process.exit(1);
    }
};
connectDB();


// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

