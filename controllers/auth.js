import asyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import generateToken from "../utils/generateToken.js";
import User from "../models/user.model.js";
// @desc    Auth user & get token
// @route   POST /api/users/login
// @access  Public

const authUser = asyncHandler(async (req, res) => {
  const { password } = req.body;
  const email = req.body.email.toLowerCase();
  const user = await User.findOne({ email });

  if (user && (await user.matchPassword(password))) {
    generateToken(res, user);
    return res.status(201).json({
      message: "User logged in",
      success: true,
      data: {
        _id: user._id,
        email: user.email,
        name: user.name,
      },
    });
  } else {
    return res.status(401);
  }
});

// @desc    Register a new user
// @route   POST /api/users
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
  const { name, password } = req.body;
  const email = req.body.email.toLowerCase();
  const userExists = await User.findOne({ email });
  if (userExists) {
    return res.status(400).json({
      message: "User already exists",
      success: false,
    });
  }

  const user = await User.create({
    email,
    name,
    password,
  });

  if (user) {
    generateToken(res, user);
    return res.status(201).json({
      message: "User created",
      success: true,
      data: {
        _id: user._id,
        email: user.email,
        name: user.name,
      },
    });
  } else {
    return res.status(400);
  }
});

// @desc  Logout user
// @route POST /api/users/logout
// @access Private

// @desc  Get user profile
// @route GET /api/users/profile
// @access Private

const forgetpassword = asyncHandler(async (req, res) => {
  const email = req.body.email.toLowerCase();
  const user = await User.findOne({ email });
  if (!user) {
    return res.status(400).json({
      message: "User does not exist",
      success: false,
    });
  }
  const token = jwt.sign({ user }, process.env.JWT_SECRET, {
    expiresIn: "30m",
  });
  var transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "acmexamportal@gmail.com",
      pass: "",
    },
  });

  var mailOptions = {
    from: "Jashan.maybe76@gmail.com",
    to: email,
    subject: "Reset Password Link",
    text: `http://localhost:5173/reset-password/${user._id}/${token}`,
  };

  transporter.sendMail(mailOptions, function (error, info) {
    if (error) {
      return res.status(400).json({
        message: "Error sending mail",
        success: false,
      });
    } else {
      return res.status(200).json({
        message: "Mail sent successfully",
        success: true,
      });
    }
  });
});

const resetpassword = asyncHandler(async (req, res) => {
  const { password } = req.body;
  const { id, token } = req.params;
  const user = await User.findById(id);
  if (!user) {
    return res.send({ Status: "User does not exist" });
  }
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  if (decoded) {
    try {
      // Hash the new password before updating it in the database
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Update user's password with the hashed password
      await User.findByIdAndUpdate(id, { password: hashedPassword });
      return res.status(200).json("Password reset successfully");
    } catch (err) {
      return res.status(400).json("Error resetting password");
    }
  } else {
    return res.status(400).json("Invalid or Expired Token");
  }
});

const logoutUser = asyncHandler(async (req, res) => {
  res.cookie("token", "none", {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });

  return res.status(200).json({
    success: true,
    data: {},
  });
});

const testRoute = asyncHandler(async (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Route working fine",
    data: {},
  });
});

export {
  authUser,
  registerUser,
  logoutUser,
  forgetpassword,
  resetpassword,
  testRoute,
};
