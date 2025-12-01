import Chats from "../models/chathistory.model.js";
import axios from "axios";
import { streamLegalAssistantResponse } from "../utils/service.js";
import User from "../models/user.model.js";
const MODEL_API = process.env.MODEL_API;

const chatdemo = {
  "message": "Chat found",
  "success": true,
  "data": {
      "_id": "675a37c3bb028b270debe3cd",
      "user": "67598849e330532b239f4a29",
      "chatId": "8826a73a-cd85-4013-af22-1ac23fb4aab7",
      "ispinned": false,
      "chatHistory": [],
      "__v": 0
  }
}

export const getChats = async (req, res) => {
  console.log("hello")
  try {
    const userId = req.user._id;
    console.log("hello")
    const chats = await Chats.find({
      user: userId,
    })

    console.log(chats);

    return res.status(200).json({
      message: "Chats found",
      success: true,
      data: chats,
    })
  } catch (error) {
    console.error("Error getting chats:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      success: false,
    }); 
  }
}

export const createChat = async (req, res) => {
  try {
    const { chatId } = req.body;

    const isChatExist = await Chats.findOne({
      chatId,
    });

    if (isChatExist) {
      return res.status(400).json({
        message: "Chat already exists",
        success: false,
      });
    }

    const chat = await Chats.create({
      chatId,
    });

    if (chat) {
      return res.status(201).json({
        message: "Chat created",
        success: true,
        data: chat,
      });
    } else {
      return res.status(400).json({
        message: "Chat not created",
        success: false,
      });
    }
  } catch (error) {
    return res.status(500).json({
      message: "Internal Server Error",
      success: false,
    });
  }
};

export const getChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    console.log(chatId);

    const chat = await Chats.findOne({
      chatId:chatId,
    });

    if (chat) {
      return res.status(200).json({
        message: "Chat found",
        success: true,
        data: chat,
      });
    } 


    chatdemo.chatId = chatId;

    return res.status(200).json({
      message: "Chat not found",
      success: true,
      data: chatdemo
    });


  } catch (error) {
    console.log(error);
    return res.status(500).json({
      message: "Internal Server Error",
      success: false,
    });
  }
};

export const updateChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { userMessage } = req.body;

    if (!userMessage) {
      return res.status(400).json({ message: "User message is required" });
    }

    // --- Pre-SSE validation (must happen BEFORE headers are sent) ---
    let chat = await Chats.findOne({ chatId });
    if (!chat) {
      chat = await Chats.create({ chatId, user: req.user._id });
    }
    if (req.user._id.toString() !== chat.user.toString()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findById(req.user._id);
    if (user.uses >= 10) {
      return res.status(403).json({
        message: "User has exceeded the maximum number of uses",
        success: false,
      });
    }

    // --- Setup for Server-Sent Events (SSE) - AFTER validation ---
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // Flush the headers to establish the connection

    // --- Update user usage count ---
    user.uses += 1;
    await user.save();
    
    const userMsg = {
      user: userMessage,
      ai: undefined,
      timestamp: new Date(),
    };
    chat.chatHistory.push(userMsg);
    await chat.save();

    const formattedHistory = chat.chatHistory
      .slice(0, -1)
      .flatMap((msg) => {
        const history = [];
        if (msg.user) history.push({ role: "user", content: msg.user });
        // Make sure to check for ai and ai.text existence
        if (msg.ai && msg.ai.text) history.push({ role: "assistant", content: msg.ai.text });
        return history;
      });

    // --- Streaming Logic ---
    // Call the new streaming function and pass the response object `res`
    const { answer, sources } = await streamLegalAssistantResponse(userMessage, formattedHistory, res);

    // --- Save the final AI response to the database AFTER the stream has finished ---
    const newMessage = {
      user: undefined,
      ai: {
        text: answer,
        sources: sources
      },
      timestamp: new Date(),
    };
    chat.chatHistory.push(newMessage);
    await chat.save();

    // End the response stream
    res.end();

  } catch (error) {
    console.error("Error in streaming chat update:", error);
    // If an error occurs, try to send an error event before closing
    if (!res.headersSent) {
        res.status(500).json({ message: "Internal Server Error" });
    } else {
        res.write(`event: error\ndata: ${JSON.stringify({ message: "An error occurred." })}\n\n`);
        res.end();
    }
  }
};

export const deleteChat = async (req, res) => {
  try {
    const { chatId } = req.params;

    const chat = await Chats.findOneAndDelete({
      chatId,
    });

    if (chat) {
      return res.status(200).json({
        message: "Chat deleted",
        success: true,
        data: chat,
      });
    } else {
      return res.status(404).json({
        message: "Chat not found",
        success: false,
      });
    }

  } catch (error) {

  }
}
