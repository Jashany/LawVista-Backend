import express from "express";
import {
  addSegment,
  createNotebook,
  deleteNotebook,
  deleteSegment,
  getNotebook,
  updateSegment,
  getUserNotebooks
} from "../controllers/notebook.js";
import verifyUser from "../middlewares/verifyUser.js";
import Notebook from "../models/notebook.model.js";

const noteBookRouter = express.Router();

noteBookRouter.post("/create-notebook",verifyUser, createNotebook);
noteBookRouter.get("/get-chats",verifyUser, getUserNotebooks);
noteBookRouter.get("/:id",verifyUser, getNotebook);

noteBookRouter.delete("/:id",verifyUser, deleteNotebook);
noteBookRouter.post("/:id/add-segment",verifyUser, addSegment);
noteBookRouter.put("/:id/update-segment/:segmentId", updateSegment);
noteBookRouter.delete("/:id/delete-segment/:segmentId", verifyUser,deleteSegment);
noteBookRouter.put("/:id/update-title",verifyUser, async (req, res) => {
  try {
    const { title } = req.body;
    const { id } = req.params;
    const notebook = await Notebook.findOne({
      notebookId: id,
    });
    if (!notebook) {
      return res
        .status(404)
        .json({ success: false, message: "Notebook not found" });
    }
    notebook.title = title;
    await notebook.save();
    return res.status(200).json({
      success: true,
      message: "Notebook title updated",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
});


export default noteBookRouter;  