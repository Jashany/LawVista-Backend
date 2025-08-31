import Notebook from "../models/notebook.model.js";
import { v4 as uuidv4 } from "uuid";

// Create a new notebook
export const getUserNotebooks = async (req, res) => {
  try {
    const user = req.user._id;
    const notebooks = await Notebook.find({ user });
    return res
      .status(200)
      .json({ message: "Notebooks retrieved", success: true, data: notebooks });
  } catch (error) {
    return res
      .status(500)
      .json({
        message: "Error retrieving notebooks",
        success: true,
        error: error.message,
      });
  }
};

export const createNotebook = async (req, res) => {
  try {
    const notebookId = await uuidv4();
    const user = req.user._id;

    const notebook = new Notebook({
      user,
      notebookId,
      title: "Untitled Notebook",
    });
    await notebook.save();
    res
      .status(201)
      .json({ message: "Notebook created successfully", data: notebook });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error creating notebook", error: error.message });
  }
};

// Get a notebook by ID
export const getNotebook = async (req, res) => {
  try {
    const { id } = req.params;
    const notebook = await Notebook.findOne({
      notebookId: id,
    });

    if (!notebook) {
      return res
        .status(404)
        .json({ success: false, message: "Notebook not found" });
    }

    console.log(req.user._id, notebook.user);
    //notebook.user is a mongoose object, so we need to convert it to a string
    if (notebook.user.toString() !== req.user._id) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized, invalid user" });
    }

    res.status(200).json({ success: true, data: notebook });
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ message: "Error retrieving notebook", error: error.message });
  }
};

// Update a notebook
export const updateNotebook = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const notebook = await Notebook.findByIdAndUpdate(id, updates, {
      new: true,
    });
    if (!notebook)
      return res.status(404).json({ message: "Notebook not found" });
    res
      .status(200)
      .json({ message: "Notebook updated successfully", notebook });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error updating notebook", error: error.message });
  }
};

// Delete a notebook
export const deleteNotebook = async (req, res) => {
  try {
    const { id } = req.params;

    const notebook = await Notebook.findOne({
      notebookId: id,
    });

    if (!notebook) {
      return res
        .status(404)
        .json({ success: false, message: "Notebook not found" });
    }

    if (req.user._id !== notebook.user.toString()) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized, invalid user" });
    }

    await Notebook.findByIdAndDelete(id);

    res
      .status(200)
      .json({ success: true, message: "Notebook deleted successfully" });
  } catch (error) {
    res.status(500).json({
      message: "Error deleting notebook",
      error: error.message,
      success: false,
    });
  }
};

// Add a segment to a notebook
export const addSegment = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes, link } = req.body;

    const segmentId = await uuidv4();

    const notebook = await Notebook.findOne({
      notebookId: id,
    })
    if (!notebook) {
      return res
        .status(404)
        .json({ message: "Notebook not found", success: false });
    }

    if (req.user._id.toString() !== notebook.user.toString()) {
      return res
        .status(401)
        .json({ message: "Unauthorized, invalid user", success: false });
    }

    notebook.segments.push({ segmentId, notes, link });
    await notebook.save();
    res.status(200).json({
      message: "Segment added successfully",
      data: notebook,
      success: false,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error adding segment", error: error.message });
  }
};

// Update a segment in a notebook
export const updateSegment = async (req, res) => {
  try {
    const { id, segmentId } = req.params;
    const updates = req.body;
    const notebook = await Notebook.findOne({
      notebookId: id,
    });

    if (!notebook)
      return res
        .status(404)
        .json({ message: "Notebook not found", success: false });

    const segment = notebook.segments.find(
      (seg) => seg.segmentId === segmentId
    );
    if (!segment) {
      return res
        .status(404)
        .json({ message: "Segment not found", success: false });
    }

    Object.assign(segment, updates);
    await notebook.save();

    res.status(200).json({
      message: "Segment updated successfully",
      data: notebook,
      success: true,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error updating segment", error: error.message });
  }
};

// Delete a segment from a notebook
export const deleteSegment = async (req, res) => {
  try {
    const { id, segmentId } = req.params;
    const notebook = await Notebook.findOne({
      notebookId: id,
    });
    if (!notebook)
      return res
        .status(404)
        .json({ message: "Notebook not found", success: false });

    if (req.user._id !== notebook.user.toString()) {
      return res
        .status(401)
        .json({ message: "Unauthorized, invalid user", success: false });
    }

    notebook.segments = notebook.segments.filter(
      (seg) => seg.segmentId !== segmentId
    );
    await notebook.save();
    res
      .status(200)
      .json({ message: "Segment deleted successfully", success: true });
  } catch (error) {
    res.status(500).json({
      message: "Error deleting segment",
      error: error.message,
      success: false,
    });
  }
};
