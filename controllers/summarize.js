import { summarizeLegalDocument } from "../utils/service.js";

export const summarizeDocument = async (req, res) => {
  try {
    let { input_text } = req.body;

    // Validate input
    if (!input_text || input_text.trim().length === 0) {
      return res.status(400).json({
        message: "Input text is required",
        success: false,
      });
    }

    // Check if text is too long (prevent excessive token usage)
    // Rough estimate: 1 word = ~1.3 tokens, limit to ~30k tokens input
    const wordCount = input_text.split(/\s+/).length;
    
    // Truncate to 10000 words if too long
    if (wordCount > 10000) {
      input_text = input_text.split(/\s+/).slice(0, 10000).join(" ");
      console.log(`Text truncated from ${wordCount} to 10000 words`);
    }

    console.log(`Summarizing document with ${Math.min(wordCount, 10000)} words...`);

    // Call the summarization function (now includes LSI)
    const { summary, sources, legalStatutes } = await summarizeLegalDocument(input_text);

    return res.status(200).json({
      message: "Document summarized successfully",
      success: true,
      data: {
        summary_text: summary,
        paths: sources,
        legalStatutes: legalStatutes || {},
      },
    });

  } catch (error) {
    console.error("Error in summarizeDocument:", error);

    // Return user-friendly error message
    let errorMessage = "Internal Server Error";
    if (error.message.includes("empty")) {
      errorMessage = "Input text is empty after preprocessing";
    } else if (error.message.includes("Failed to generate")) {
      errorMessage = "Failed to generate summary. Please try again.";
    }

    return res.status(500).json({
      message: errorMessage,
      success: false,
    });
  }
};
