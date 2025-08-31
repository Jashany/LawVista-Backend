import mongoose from "mongoose";

const caseSchema = new mongoose.Schema({
  Case_id: {
    type: String,
    required: true,
    unique: true,
  },
  Case_Title: {
    type: String,
    required: true,
  },
  Court_Name: {
    type: String,
    required: true,
  },
  Judgment_Author: {
    type: String,
  },
  Bench: {
    type: String,
  },
  Citations: {
    type: String,
    default: "Not Found",
  },
  Issues: {
    type: [String],
    default: [],
  },
  Facts: {
    type: [String], // Array of strings for storing facts
    default: [],
  },
  Conclusions: {
    type: [String], // Array of strings for storing conclusions
    default: [],
  },
  PDF_Path: {
    type: String,
    required: true,
  },
  judgement_path: {
    type: String,
    required: true,
  },
});

const Case = mongoose.model("Case", caseSchema);

export default Case;
