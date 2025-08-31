import express from "express";
import { deleteChat, getChat, getChats, updateChat } from "../controllers/chats.js";
import verifyUser from "../middlewares/verifyUser.js";


const chatRouter = express.Router();

chatRouter.post("/update-chat/:chatId",verifyUser, updateChat);
chatRouter.get("/:chatId",verifyUser, getChat);
chatRouter.get("/delete-chat/:chatId",verifyUser, deleteChat);
chatRouter.get("/",verifyUser, getChats);

export default chatRouter;