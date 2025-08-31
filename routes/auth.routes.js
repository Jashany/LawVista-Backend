import { authUser, forgetpassword, logoutUser, registerUser, resetpassword, testRoute } from "../controllers/auth.js";
import express from "express";
import {
    passwordResetLimiter,
    validateRegister,
    validateLogin,
    validatePasswordReset,
    validateForgotPassword,
    handleValidationErrors
} from "../middlewares/security.js";

const authRouter = express.Router();

authRouter.post("/register", validateRegister, handleValidationErrors, registerUser);
authRouter.post("/login", validateLogin, handleValidationErrors, authUser);
authRouter.post("/forgot-password", passwordResetLimiter, validateForgotPassword, handleValidationErrors, forgetpassword);
authRouter.post("/reset-password/:id/:token", passwordResetLimiter, validatePasswordReset, handleValidationErrors, resetpassword);
authRouter.get("/logout", logoutUser);
authRouter.get("/test", testRoute);

export default authRouter;