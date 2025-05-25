const userModel = require("../models/userModel");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { sendEmail } = require("../utils/sendMail");

const registerController = async (req, res) => {
  try {
    const exisitingUser = await userModel.findOne({ email: req.body.email });

    if (exisitingUser) {
      return res.status(500).send({
        success: false,
        message: "User ALready exists",
      });
    }

  
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(req.body.password, salt);
    req.body.password = hashedPassword;


    const user = new userModel(req.body);
    sendEmail(
      req.body.email,
      "Welcome to Blood Bridge ❤️",
      `
        <h2>Welcome to Blood Bridge, ${req.body.name || "Donor"}!</h2>
        <p>Thank you for registering and becoming a part of our life-saving community.</p>
        <p>With your help, we’re bridging the gap between those in need and those who can help. 💉🩸</p>
        <p>Explore our platform to donate or request blood, connect with hospitals, and make a real difference.</p>
        <br/>
        <p><strong>Let’s save lives, one drop at a time!</strong></p>
        <p>Team Blood Bridge</p>
      `
    );

    await user.save();

    return res.status(201).send({
      success: true,
      message: "User Registerd Successfully",
      user,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).send({
      success: false,
      message: "Error In Register API",
      error,
    });
  }
};

const loginController = async (req, res) => {
  try {
    const user = await userModel.findOne({ email: req.body.email });

    if (!user) {
      return res.status(404).send({
        success: false,
        message: "Invalid Credentials",
      });
    }

    // Check role
    if (user.role !== req.body.role) {
      return res.status(403).send({
        success: false,
        message: "Role doesn't match",
      });
    }

    // Compare password
    const comparePassword = await bcrypt.compare(
      req.body.password,
      user.password
    );
    if (!comparePassword) {
      return res.status(401).send({
        success: false,
        message: "Invalid Credentials",
      });
    }

    // Generate token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    return res.status(200).send({
      success: true,
      message: "Login Successfully",
      token,
      user,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Error In Login API",
      error,
    });
  }
};


const currentUserController = async (req, res) => {
  try {
    const user = await userModel.findOne({ _id: req.body.userId });
    return res.status(200).send({
      success: true,
      message: "User Fetched Successfully",
      user,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).send({
      success: false,
      message: "unable to get current user",
      error,
    });
  }
};

module.exports = { registerController, loginController, currentUserController };
