import mongoose from "mongoose";

// Schema for source objects with case metadata
const SourceSchema = new mongoose.Schema({
    case_id: String,
    case_title: String,
    source_url: String,
    r2_url: String,
    court: String,
    judge: String,
    year: Number,
}, { _id: false });

const AiChatHistory = {
    text : {
        type: String,
    },
    sources : [SourceSchema],
}

const chatHistorySchema = new mongoose.Schema({
    user:{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    chatId : {
        type: String,
        required: true,
        unique: true,
    },
    ispinned : {
        type: Boolean,
        default: false,
    },
    chatHistory : [
        {
            user : {
                type: String,
            },
            ai : AiChatHistory,
            timestamp : {
                type: Date,
                default: Date.now,
            },
        },
    ],
});

const Chats = mongoose.model("Chats", chatHistorySchema);

export default Chats;