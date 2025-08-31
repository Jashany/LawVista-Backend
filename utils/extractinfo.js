import jwt from "jsonwebtoken";

const extractInfo = (cookies) => {
  try {
    const token = cookies.jwt;

    if (!token) {
      return res.status(401).json({ message: "No token, authorization denied" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    return decoded.user;
  } catch (error) {
    console.error(error);
    return res.status(401).json({ message: "Token is not valid" });
  }
};

export default extractInfo;