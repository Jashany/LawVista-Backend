import Case from "../models/case.model.js";

const getCaseByID = async (req, res) => {
    try {
        const caseID = req.params.id;
        const caseData = await Case.findOne({ Case_id: caseID });
        if (!caseData) {
            return res.status(404).json({ message: "Case not found" });
        }
        return res.status(200).json({
            data: caseData,
            message : "Case found",
            success : true,
        });
    } catch (error) {
        return res.status(500).json({ 
            message: error.message,
            success : false,
         });
    }
}

export { getCaseByID };