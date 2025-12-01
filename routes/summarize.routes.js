import express from "express";
import { summarizeDocument } from "../controllers/summarize.js";
import verifyUser from "../middlewares/verifyUser.js";

const summarizeRouter = express.Router();

summarizeRouter.post("/", verifyUser, summarizeDocument);

export default summarizeRouter;
