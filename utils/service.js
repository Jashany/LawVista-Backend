import dotenv from "dotenv";
dotenv.config();

import { ChatGroq } from "@langchain/groq";
import { ChatOpenAI } from "@langchain/openai";
import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";
import { PineconeStore } from "@langchain/pinecone";
import { Pinecone } from "@pinecone-database/pinecone";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import axios from "axios";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME;
const HF_TOKEN = process.env.HF_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// --- GROQ API KEY ROTATION ---
const GROQ_API_KEYS = [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
].filter(Boolean); // Remove undefined keys

let currentGroqKeyIndex = 0;
let keyFailureCounts = new Map(); // Track failures per key

function getNextGroqApiKey() {
    // Find a working key (skip keys that have failed recently)
    for (let i = 0; i < GROQ_API_KEYS.length; i++) {
        const index = (currentGroqKeyIndex + i) % GROQ_API_KEYS.length;
        const key = GROQ_API_KEYS[index];
        const failures = keyFailureCounts.get(key) || 0;
        
        // Reset failure count after 1 minute
        if (failures < 3) {
            currentGroqKeyIndex = (index + 1) % GROQ_API_KEYS.length;
            console.log(`Using Groq API key #${index + 1}`);
            return key;
        }
    }
    
    // If all keys have failed, reset and try the first one
    keyFailureCounts.clear();
    currentGroqKeyIndex = 0;
    console.log("All Groq keys exhausted, resetting...");
    return GROQ_API_KEYS[0];
}

function markGroqKeyFailed(apiKey) {
    const failures = keyFailureCounts.get(apiKey) || 0;
    keyFailureCounts.set(apiKey, failures + 1);
    console.log(`Groq key marked as failed (${failures + 1} failures)`);
    
    // Clear failure counts after 60 seconds
    setTimeout(() => {
        keyFailureCounts.delete(apiKey);
    }, 60000);
}

// --- LLM FACTORY FUNCTIONS ---

function createGroqLLM(model = "llama-3.3-70b-versatile") {
    const apiKey = getNextGroqApiKey();
    return {
        llm: new ChatGroq({ 
            model, 
            apiKey,
            temperature: 0 
        }),
        apiKey
    };
}

function createOpenAILLM() {
    // GPT-4o-mini - good for LSI extraction (cheaper, 512k daily tokens)
    return new ChatOpenAI({
        model: "gpt-4o-mini",
        apiKey: OPENAI_API_KEY,
        temperature: 0
    });
}

// --- SMART LLM CALLER WITH FALLBACK ---

async function invokeLLMWithFallback(prompt, preferOpenAI = false) {
    // Strategy: Use OpenAI for LSI (cheaper), Groq for main tasks
    
    if (preferOpenAI && OPENAI_API_KEY) {
        try {
            const openaiLLM = createOpenAILLM();
            const response = await openaiLLM.invoke(prompt);
            console.log("Used OpenAI GPT-4o-mini");
            return response;
        } catch (error) {
            console.error("OpenAI failed, falling back to Groq:", error.message);
        }
    }
    
    // Try Groq with rotation
    let lastError = null;
    for (let attempt = 0; attempt < GROQ_API_KEYS.length; attempt++) {
        const { llm, apiKey } = createGroqLLM();
        try {
            const response = await llm.invoke(prompt);
            return response;
        } catch (error) {
            lastError = error;
            markGroqKeyFailed(apiKey);
            console.error(`Groq attempt ${attempt + 1} failed:`, error.message);
            
            // If rate limited, try next key immediately
            if (error.message?.includes('rate') || error.status === 429) {
                continue;
            }
            break;
        }
    }
    
    // Final fallback to OpenAI if Groq completely fails
    if (OPENAI_API_KEY && !preferOpenAI) {
        try {
            console.log("All Groq keys failed, using OpenAI fallback");
            const openaiLLM = createOpenAILLM();
            return await openaiLLM.invoke(prompt);
        } catch (error) {
            console.error("OpenAI fallback also failed:", error.message);
        }
    }
    
    throw lastError || new Error("All LLM providers failed");
}

// Global cache
let vectorStoreInstance = null;

// 1. INITIALIZE (Only once)
async function getResources() {
    if (vectorStoreInstance) {
        const { llm } = createGroqLLM();
        return { vectorStore: vectorStoreInstance, llm };
    }

    const pinecone = new Pinecone({ apiKey: PINECONE_API_KEY });
    const pineconeIndex = pinecone.index(PINECONE_INDEX_NAME);

    const embeddings = new HuggingFaceInferenceEmbeddings({
        apiKey: HF_TOKEN,
        model: "sentence-transformers/all-mpnet-base-v2",
    });

    vectorStoreInstance = new PineconeStore(embeddings, { pineconeIndex });
    const { llm } = createGroqLLM();

    console.log("Resources initialized.");
    return { vectorStore: vectorStoreInstance, llm };
}

// --- PDF TEXT EXTRACTION (for richer context) ---
async function fetchPdfText(pdfUrl, maxChars = 10000) {
    try {
        if (!pdfUrl || pdfUrl === "#") return null;
        
        console.log(`📄 Fetching PDF: ${pdfUrl}`);
        const response = await axios.get(pdfUrl, { 
            responseType: 'arraybuffer',
            timeout: 12000 // 12 second timeout
        });
        
        const pdfData = await pdf(Buffer.from(response.data));
        const text = pdfData.text?.replace(/\s+/g, ' ').trim();
        
        if (text && text.length > 100) {
            console.log(`✅ Extracted ${text.length} chars from PDF`);
            return text.slice(0, maxChars);
        }
        return null;
    } catch (error) {
        console.error(`❌ PDF fetch failed: ${error.message}`);
        return null;
    }
}

// 2. MAIN FUNCTION
export async function streamLegalAssistantResponse(userInput, chatHistory, res) {
    try {
        const { vectorStore, llm } = await getResources();
        
        // --- STEP A: THE "HI" FILTER (Regex instead of AI) ---
        // If it's just a greeting, don't even touch the database.
        const greetings = ["hi", "hello", "hey", "greetings", "good morning", "good evening", "thanks", "thank you"];
        const cleanInput = userInput.toLowerCase().trim().replace(/[?!.]/g, "");
        
        if (greetings.includes(cleanInput) || cleanInput.length < 3) {
            // IMMEDIATE RETURN
            res.write(`event: sources\ndata: []\n\n`); // 0 Sources guaranteed
            res.write(`event: chunk\ndata: "Hello! I am your legal assistant. How can I help you with Indian Commercial Law today?"\n\n`);
            res.write(`event: end\ndata: {}\n\n`);
            return { answer: "Greeting", sources: [] };
        }

        // --- STEP B: MANUAL DATABASE SEARCH ---
        // We do this manually to see the scores.
        console.log(`Searching DB for: "${userInput}"`);
        const cleanQuery = userInput.replace(/[^\w\s]/gi, '');
        const results = await vectorStore.similaritySearchWithScore(cleanQuery, 4); // Top 4 only

        // --- STEP C: THE STRICT FILTER ---
        // If score < 0.60, it's garbage. Throw it away.
        
       const validDocs = results.filter(([doc, score]) => {
            //using cosine similarity: higher is better
            if (score >= 0.6) return true;

            return false;
        });

        // Format sources for the Frontend
        let uniqueSources = [];
        let contextText = "";

        if (validDocs.length > 0) {
            // We have valid cases
            // Fetch full PDF text for top 2 results for richer context
            const enrichedDocs = await Promise.all(
                validDocs.slice(0, 2).map(async ([doc, score]) => {
                    const m = doc.metadata;
                    const pdfUrl = m.source_url || m.r2_url;
                    
                    // Try to get full PDF text, fallback to snippet
                    let fullText = await fetchPdfText(pdfUrl, 8000);
                    if (!fullText) {
                        fullText = doc.page_content || m.text_snippet || "";
                    }
                    
                    return { doc, score, fullText };
                })
            );
            
            // For remaining docs (3rd, 4th), just use snippet
            const remainingDocs = validDocs.slice(2).map(([doc, score]) => ({
                doc,
                score,
                fullText: doc.page_content || doc.metadata.text_snippet || ""
            }));
            
            const allDocs = [...enrichedDocs, ...remainingDocs];
            
            contextText = allDocs.map(({ doc, score, fullText }) => {
                const m = doc.metadata;
                const caseTitle = m.case_title || "Unknown Case";
                return `CASE: ${caseTitle}\nCOURT: ${m.court || "Unknown"}\n\n${fullText}`;
            }).join("\n\n---\n\n");
            
            console.log(`Context text length: ${contextText.length} chars`);
            
            uniqueSources = validDocs.map(([doc, score]) => {
                const m = doc.metadata;
                return {
                    case_title: m.case_title || "Unknown Case",
                    source_url: m.r2_url || m.source_url  || "#",
                    score: score
                };
            });
            
            // Remove duplicates
            uniqueSources = [...new Map(uniqueSources.map(item => [item.case_title, item])).values()];
        } else {
            // We have NO valid cases -> Common Knowledge Mode
            console.log("No docs met threshold. Switching to Common Knowledge.");
            contextText = "NO SPECIFIC CASE FILES FOUND."; 
            uniqueSources = []; // Force empty sources
        }

        // --- STEP D: GENERATION ---
        
        // Send sources to frontend IMMEDIATELY (so they don't change later)
        res.write(`event: sources\ndata: ${JSON.stringify(uniqueSources)}\n\n`);

        const systemPrompt = `You are an expert Indian Legal Advisor.

RELEVANT CASES FROM DATABASE:
${contextText}

INSTRUCTIONS:
1. The above contains excerpts from relevant legal cases found in our database.
2. Use this information to answer the user's question. Cite the case names provided.
3. If the excerpts are brief, supplement with your knowledge of the case if you recognize it, but prioritize the provided information.
4. If "NO SPECIFIC CASE FILES FOUND" appears above, use your general knowledge of Indian Law.
5. Be helpful and thorough in your response.
6. Dont say words like using common knowledge etc or i am an ai language model. Just answer the question directly.
`;

        const messages = [
            new SystemMessage(systemPrompt),
            ...chatHistory.map(m => m.role === 'user' ? new HumanMessage(m.content) : new SystemMessage(m.content)), // Simplify history
            new HumanMessage(userInput)
        ];

        const stream = await llm.stream(messages);
        
        let fullAnswer = "";
        for await (const chunk of stream) {
            const token = chunk.content;
            fullAnswer += token;
            res.write(`event: chunk\ndata: ${JSON.stringify(token)}\n\n`);
        }
        
        console.log("sources sent:", uniqueSources);
        res.write(`event: end\ndata: {}\n\n`);

        return { answer: fullAnswer, sources: uniqueSources };

    } catch (e) {
        console.error("Error:", e);
        res.write(`event: error\ndata: "Internal Server Error"\n\n`);
        throw e;
    }
}

// --- UTILS (Cleaning & Summarization) ---

export function cleanLegalDocument(text) {
    if (!text) return "";
    let lines = text.split('\n');
    let mainContent = lines.filter(line => !line.trim().match(/^\d+$/)); // Simple filter
    
    // If complex logic needed, revert to previous regex, but usually basic strip is fine for summary
    let cleaned = mainContent.join('\n');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return cleaned.slice(0, 15000); // Limit context size
}

// --- LSI (Legal Statute Identification) ---
// Optimized: Uses GPT-4o-mini (single call) to save API quota

export async function extractLegalStatutes(inputText) {
    try {
        // Truncate to ~4000 words to fit in one API call
        const truncatedText = inputText.split(/\s+/).slice(0, 4000).join(" ");
        
        const extractionPrompt = `You are an expert Indian legal analyst. Analyze this legal document and extract ALL applicable Indian laws, acts, sections, and legal provisions mentioned or relevant to the case.

For each statute/law found, provide:
1. The official name (e.g., "Section 302 IPC", "Contract Act, 1872")
2. A clear 2-3 sentence explanation of what it means and how it applies

DOCUMENT:
${truncatedText}

IMPORTANT: Return your response as valid JSON only, no other text. Format:
{
  "Section 302 IPC": "This section deals with punishment for murder under the Indian Penal Code. It prescribes either death penalty or life imprisonment along with fine for those convicted of murder.",
  "Section 34 IPC": "This section addresses acts done by several persons in furtherance of common intention. When a criminal act is done by several persons, each person is liable as if the act was done by them alone."
}

If no specific statutes are found, return: {}`;

        // Use GPT-4o-mini for LSI (preferOpenAI = true) - saves Groq quota
        const response = await invokeLLMWithFallback(extractionPrompt, true);
        
        // Parse JSON response
        try {
            // Extract JSON from response (handle markdown code blocks)
            let jsonStr = response.content;
            const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                jsonStr = jsonMatch[1];
            }
            
            // Clean up the string
            jsonStr = jsonStr.trim();
            if (!jsonStr.startsWith('{')) {
                const startIdx = jsonStr.indexOf('{');
                const endIdx = jsonStr.lastIndexOf('}');
                if (startIdx !== -1 && endIdx !== -1) {
                    jsonStr = jsonStr.slice(startIdx, endIdx + 1);
                }
            }
            
            const parsed = JSON.parse(jsonStr);
            console.log(`Extracted ${Object.keys(parsed).length} legal statutes`);
            return parsed;
        } catch (parseError) {
            console.error("JSON parse error, attempting fallback parsing:", parseError.message);
            
            // Fallback: Parse line-by-line
            const statutes = {};
            const lines = response.content.split('\n');
            
            for (const line of lines) {
                // Match patterns like "Section 302 IPC: description" or "**Section 302 IPC**: description"
                const match = line.match(/^\*?\*?([^:*]+(?:Section|Act|IPC|CrPC|CPC)[^:*]*)\*?\*?\s*:\s*(.+)$/i) ||
                              line.match(/^["']?([^"':]+)["']?\s*:\s*["']?(.+)["']?,?$/);
                
                if (match && match[2] && match[2].length > 20) {
                    const key = match[1].replace(/^\*+\s*/, '').replace(/\*+$/, '').trim();
                    const value = match[2].replace(/["',]+$/, '').trim();
                    
                    if (key.length > 3 && key.length < 100) {
                        statutes[key] = value;
                    }
                }
            }
            
            console.log(`Fallback extracted ${Object.keys(statutes).length} statutes`);
            return statutes;
        }
    } catch (error) {
        console.error("Error extracting legal statutes:", error);
        return {};
    }
}

export async function summarizeLegalDocument(inputText) {
    const cleanedText = cleanLegalDocument(inputText);
    if (!cleanedText) throw new Error("Input text is empty");

    // Use Groq for summarization (main task, preferOpenAI = false)
    const summaryPrompt = `You are an expert legal assistant specializing in summarizing legal documents.
Just give the summary, and don't write statements like "Here is a concise and coherent summary" or "The summary is as follows:".

Summarize this legal document in about 500 words, focusing on the key facts, arguments, and conclusions:

${cleanedText}`;

    const summaryResponse = await invokeLLMWithFallback(summaryPrompt, false);
    
    // Get vector store for similar cases
    const { vectorStore } = await getResources();
    
    // Manual search for recommendations
    const similarDocs = await vectorStore.similaritySearchWithScore(summaryResponse.content, 5);
    
    // Filter by relevance score
    const sources = similarDocs
        .filter(([_, score]) => score < 0.35 || score >= 0.5) // Euclidean: lower is better, Cosine: higher is better
        .map(([doc, score]) => ({
            case_title: doc.metadata.case_title || doc.metadata.source || "Unknown Case",
            source_url: doc.metadata.r2_url || doc.metadata.source_url || doc.metadata.source || "#",
            score: score
        }));

    // Unique sources
    const uniqueSources = [...new Map(sources.map(item => [item.case_title, item])).values()];

    // Extract legal statutes (uses GPT-4o-mini to save Groq quota)
    const legalStatutes = await extractLegalStatutes(inputText);

    return {
        summary: summaryResponse.content,
        sources: uniqueSources,
        legalStatutes: legalStatutes
    };
}