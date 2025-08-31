import jwt from "jsonwebtoken";

const verifyUser = (req, res, next) => {
  try {
    const token = req.cookies.jwt;

    // console.log("heko")

    if (!token) {
      return res.status(401).json({
        message: "Unauthorized, token missing",
        success: false,
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded.user;
    // console.log("decoded", decoded);
    next();
  } catch (error) {
    console.error("Token verification failed:", error);
    console.log("hello")
    return res.status(401).json({
      message: "Unauthorized, invalid token",
      success: false,
    });
  }
};

export default verifyUser;
