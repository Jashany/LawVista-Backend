import mongoose from "mongoose";


const AiChatHistory = {
    text : {
        type: String,
    },
    sources : [
        {
            type: String,
        },
    ],
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