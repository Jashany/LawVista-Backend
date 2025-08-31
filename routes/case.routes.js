import { getCaseByID } from "../controllers/cases.js";
import express from "express";
const caseRouter = express.Router();

caseRouter.get("/:id", getCaseByID);

export default caseRouter;