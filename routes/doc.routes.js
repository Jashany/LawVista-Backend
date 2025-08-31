import express from "express";
import verifyUser from "../middlewares/verifyUser.js";
import { createDoc, getDoc, getUserDocs, updateDoc } from "../controllers/doc.js";


const docRouter = express.Router();

docRouter.post("/",verifyUser, createDoc);
docRouter.get("/",verifyUser, getUserDocs);
docRouter.get("/:id",verifyUser, getDoc);
docRouter.put("/update/:id",verifyUser, updateDoc);

export default docRouter;