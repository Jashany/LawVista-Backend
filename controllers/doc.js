import Document from "../models/document.model.js";

export const getUserDocs = async (req, res) => {
  try {
    const docs = await Document.find({ user: req.user._id });
    res.status(200).json({ success: true, data: docs });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error retrieving docs", error: error.message });
  }
};

export const getDoc = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await Document.findOne({
      documentId: id,
    });

    if (!doc) {
      return res
        .status(404)
        .json({ success: false, message: "Document not found" });
    }

    

    res.status(200).json({ success: true, data: doc });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error retrieving doc", error: error.message });
  }
};

export const createDoc = async (req, res) => {
  try {
    const doc = await Document.create({
      user: req.user._id,
      ...req.body,
    });

    res.status(201).json({ success: true, data: doc });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error creating doc", error: error.message });
  }
};

export const updateDoc = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const doc = await Document.findByIdAndUpdate(id, updates);
    if (!doc)
      return res
        .status(404)
        .json({ message: "Document not found", success: false });
    res
      .status(200)
      .json({ message: "Document updated successfully", doc, success: true });
  } catch {
    res
      .status(500)
      .json({ message: "Error updating document", error: error.message });
  }
};
