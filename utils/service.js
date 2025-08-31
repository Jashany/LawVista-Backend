import dotenv from "dotenv";
dotenv.config();

import { ChatGroq } from "@langchain/groq";
import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";
import { PineconeStore } from "@langchain/pinecone";
import { Pinecone } from "@pinecone-database/pinecone";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createRetrievalChain } from "langchain/chains/retrieval";
import { createHistoryAwareRetriever } from "langchain/chains/history_aware_retriever";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const HF_TOKEN = process.env.HF_TOKEN;


let conversationalRetrievalChain;

export async function initializeLangchain() {
    if (conversationalRetrievalChain) return;

    const pinecone = new Pinecone({ apiKey: PINECONE_API_KEY });
    const pineconeIndex = pinecone.index(PINECONE_INDEX_NAME);

    const embeddings = new HuggingFaceInferenceEmbeddings({
        apiKey: HF_TOKEN,
        model: "sentence-transformers/all-mpnet-base-v2",
    });

    const vectorstore = new PineconeStore(embeddings, { pineconeIndex });
    const llm = new ChatGroq({ model: "llama3-8b-8192", apiKey: GROQ_API_KEY });

    const retriever = vectorstore.asRetriever({
        searchType: "similarity_score_threshold",
        searchKwargs: { k: 5, scoreThreshold: 0.5 },
    });

    const historyAwarePrompt = ChatPromptTemplate.fromMessages([
        new MessagesPlaceholder("chat_history"),
        ["user", "{input}"],
        ["user", "Given the above conversation, formulate a standalone question that can be understood without the chat history. Do not answer the question, just reformulate it if needed and otherwise return it as is. Return only the question."],
    ]);

    const historyAwareRetrieverChain = await createHistoryAwareRetriever({
        llm,
        retriever,
        rephrasePrompt: historyAwarePrompt,
    });

const qaSystemPrompt = `You are an intelligent and conversational legal assistant specializing in commercial cases and laws. Your primary goal is to provide accurate and helpful answers.

### YOUR TASK ###
Follow these steps in order to formulate your response:

**Step 1: Analyze the User's Question**
- First, understand the user's intent. Is it a greeting, a specific question related to a document, a general legal question, or something out of scope?

**Step 2: Analyze the Provided Context**
- The <context> below contains documents retrieved based on the user's question.
- Assess if this context is relevant and sufficient to answer the question. It might be empty, partially relevant, or completely irrelevant.

**Step 3: Formulate Your Response Based on These Rules**

*   **RULE 1: Direct Answer from Context**
    If the <context> contains a clear and direct answer to the user's question, provide a comprehensive answer based **exclusively** on the provided context. Do not mention the context directly (e.g., avoid saying "According to the context...").

*   **RULE 2: Irrelevant Context or No Context**
    If the <context> is empty OR you determine it is **not relevant** to the user's question, you MUST completely ignore it and proceed as follows:
    a. **General Legal Question:** If the question is about a general commercial law topic, answer it using your own internal knowledge. **You MUST state that your answer is based on general legal principles and not from the specific documents.** For example, start with "Based on general legal principles..." or a similar phrase.
    b. **Greetings & Small Talk:** If the question is a simple greeting or small talk (e.g., "how are you?"), respond politely and conversationally. Do not mention documents or context.
    c. **Out-of-Scope Question:** If the question is outside the domain of commercial law or unanswerable, politely state that you cannot help with that specific query.

### IMPORTANT CONSTRAINTS ###
- **Tone:** Maintain a professional, conversational, and helpful tone.
- **Conciseness:** Keep answers to a maximum of 2-3 paragraphs.
- **Domain:** Strictly limit your answers to Indian commercial law.

<context>
{context}
</context>

Question: {input}`;

    const qaPrompt = ChatPromptTemplate.fromMessages([
        ["system", qaSystemPrompt],
        new MessagesPlaceholder("chat_history"),
        ["human", "{input}"],
    ]);

    const documentChain = await createStuffDocumentsChain({ llm, prompt: qaPrompt });

    conversationalRetrievalChain = await createRetrievalChain({
        retriever: historyAwareRetrieverChain,
        combineDocsChain: documentChain,
    });

    console.log("Langchain components initialized.");
}

// langchainService.js (or wherever getLegalAssistantResponse is)

// ... (imports at the top)

// ... (initializeLangchain function remains the same, we will modify its prompt later)

export async function streamLegalAssistantResponse(userInput, chatHistory, res) {
    if (!conversationalRetrievalChain) {
        await initializeLangchain();
        if (!conversationalRetrievalChain) {
            throw new Error("Langchain service could not be initialized.");
        }
    }

    const formattedHistory = chatHistory.map(msg =>
        msg.role === "user" ? new HumanMessage(msg.content) : new AIMessage(msg.content)
    );

    try {
        // For now, let's use the non-streaming approach to get the full response
        const response = await conversationalRetrievalChain.invoke({
            chat_history: formattedHistory,
            input: userInput,
        });

        const answer = response.answer || "";
        const context = response.context || [];
        
        const sources = context
            .map(doc => doc.metadata?.source?.replace(/^data[\\/]/i, '') || null)
            .filter(source => source !== null);
        const uniqueSources = Array.from(new Set(sources));
        
        // --- START STREAMING SIMULATION ---
        
        // 1. Send the sources to the client first
        res.write(`event: sources\ndata: ${JSON.stringify(uniqueSources)}\n\n`);

        // 2. Simulate streaming by sending the answer in chunks
        const words = answer.split(' ');
        const chunkSize = 3; // Send 3 words at a time
        
        for (let i = 0; i < words.length; i += chunkSize) {
            const chunk = words.slice(i, i + chunkSize).join(' ') + (i + chunkSize < words.length ? ' ' : '');
            res.write(`event: chunk\ndata: ${JSON.stringify(chunk)}\n\n`);
            
            // Small delay to simulate real streaming
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        // 3. Send an end event to signal completion
        res.write(`event: end\ndata: {}\n\n`);

        // Return the full answer for database storage
        return {
            answer: answer,
            sources: uniqueSources,
        };
        
    } catch (error) {
        console.error("Error in streamLegalAssistantResponse:", error);
        throw error;
    }
}