const Razorpay = require("razorpay");
const Payment = require("../models/paymentModel");
const hospitalInventoryModel = require("../models/hospitalInventoryModel");
const userInventoryModel = require("../models/userInventoryModel");
const User = require("../models/userModel");
const crypto = require("crypto");
const { default: mongoose } = require("mongoose");
const orgInventoryModel = require("../models/orgInventoryModel");

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_SECRET,
});

// ✅ Get Razorpay Key ID
const getRazorPay_keyID = async (req, res) => {
  try {
    res.json({
      success: true,
      razorpay_keyID: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("Error fetching Razorpay Key ID:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ✅ Create Payment Order
const create_order = async (req, res) => {
  try {
    const { quantity, hospitalId } = req.body;

    if (!quantity || quantity <= 0 || !hospitalId) {
      return res.status(400).json({ success: false, message: "Invalid input" });
    }

    // Find the hospital
    const hospital = await User.findById(hospitalId);
    if (!hospital || hospital.role !== "hospital") {
      return res
        .status(404)
        .json({ success: false, message: "Hospital not found" });
    }

    // Ensure hospital has enough blood
    if (hospital.bloodStock < quantity) {
      return res
        .status(400)
        .json({ success: false, message: "Not enough blood available" });
    }

    // Calculate amount (₹1 per mL)
    const amount = quantity * 100;

    const options = {
      amount,
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);

    res.json({
      success: true,
      order,
      razorpayKey: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ✅ Verify Payment
const verify_payment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      quantity,
      hospitalId,
      bloodGroup,
      recipientId,
      amount,
    } = req.body;

    // Validate inputs
    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature ||
      !quantity ||
      !hospitalId ||
      !bloodGroup ||
      !recipientId ||
      !amount
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    // Verify payment signature
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return res
        .status(400)
        .json({ success: false, message: "Payment verification failed!" });
    }

    // Verify hospital exists and has enough stock
    const hospital = await User.findById(hospitalId);
    if (!hospital || hospital.role !== "hospital") {
      return res
        .status(404)
        .json({ success: false, message: "Hospital not found" });
    }

    // Verify recipient exists
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res
        .status(404)
        .json({ success: false, message: "Recipient not found" });
    }

    // Check hospital's blood availability
    const [bloodIn] = await hospitalInventoryModel.aggregate([
      { $match: { hospital: hospital._id, bloodGroup, inventoryType: "in" } },
      { $group: { _id: null, total: { $sum: "$quantity" } } },
    ]);

    const [bloodOut] = await hospitalInventoryModel.aggregate([
      { $match: { hospital: hospital._id, bloodGroup, inventoryType: "out" } },
      { $group: { _id: null, total: { $sum: "$quantity" } } },
    ]);

    const available = (bloodIn?.total || 0) - (bloodOut?.total || 0);
    if (available < quantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${available} units of ${bloodGroup} available`,
      });
    }

    // Create inventory records
    await hospitalInventoryModel.create({
      inventoryType: "out",
      bloodGroup,
      quantity,
      hospital: hospital._id,
      user: recipientId,
      email: hospital.email,
    });

    await userInventoryModel.create({
      inventoryType: "in",
      bloodGroup,
      quantity,
      user: recipientId,
      hospital: hospital._id,
      email: recipient.email,
    });

    // Save payment record
    const payment = await Payment.create({
      razorpay_order_id,
      razorpay_payment_id,
      amount,
      bloodQuantity: quantity,
      bloodGroup,
      fromHospital: hospital._id,
      toUser: recipientId,
      status: "completed",
    });

    return res.status(200).json({
      success: true,
      message: "Payment verified and blood transferred",
      transactionId: payment._id,
    });
  } catch (error) {
    console.error("Payment verification error:", error);
    return res.status(500).json({
      success: false,
      message: "Payment processing failed",
      error: error.message,
    });
  }
};
const verify_payment_hospital = async (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      hospitalId,
      organisationId,
      bloodGroup,
      quantity,
    } = req.body;

    // Validate required fields
    const requiredFields = {
      razorpay_payment_id: "Payment ID",
      razorpay_order_id: "Order ID",
      razorpay_signature: "Signature",
      hospitalId: "Hospital ID",
      organisationId: "Organization ID",
      bloodGroup: "Blood Group",
      quantity: "Quantity",
    };

    const missingFields = Object.entries(requiredFields)
      .filter(([field]) => !req.body[field])
      .map(([_, name]) => name);

    if (missingFields.length > 0) {
      console.log("Missing required fields:", missingFields);
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    // Validate quantity
    if (isNaN(quantity) || quantity <= 0) {
      console.log("Invalid quantity:", quantity);
      return res.status(400).json({
        success: false,
        message: "Quantity must be a positive number",
      });
    }

    // Verify payment signature
    console.log("Verifying payment signature...");
    if (!process.env.RAZORPAY_SECRET) {
      throw new Error("Razorpay secret key not configured");
    }

    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      console.log("Signature mismatch:", {
        received: razorpay_signature,
        generated: generatedSignature,
      });
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }
    console.log("Payment signature verified");

    // 1. Validate hospital exists
    console.log(`Fetching hospital: ${hospitalId}`);
    const hospital = await User.findById(hospitalId);
    if (!hospital || hospital.role !== "hospital") {
      console.log("Invalid hospital:", hospitalId);
      throw new Error("Hospital not found or invalid");
    }
    console.log(`Hospital validated: ${hospital.hospitalName}`);

    // 2. Validate organization exists
    console.log(`Fetching organization: ${organisationId}`);
    const organization = await User.findById(organisationId);
    if (!organization || organization.role !== "organisation") {
      console.log("Invalid organization:", organisationId);
      throw new Error("Organization not found or invalid");
    }

    const hospitalInventoryRecord = await hospitalInventoryModel.create({
      inventoryType: "in", // Hospital receiving blood
      bloodGroup,
      quantity,
      hospital: hospital._id,
      organisation: organization._id,
      email: hospital.email,
    });
    const OrgInventoryRecord = await orgInventoryModel.create({
      inventoryType: "out",
      bloodGroup,
      quantity,
      hospital: hospital._id,
      organisation: organization._id,
      email: hospital.email,
    });

    const paymentRecord = await Payment.create({
      razorpay_order_id,
      razorpay_payment_id,
      amount: quantity * 100,
      bloodQuantity: quantity,
      bloodGroup,
      fromOrganisation: organization._id,
      toHospital: hospital._id,
      status: "completed",
    });
    console.log("Payment record created:", paymentRecord._id);

    return res.status(200).json({
      success: true,
      message: "Payment verified and blood transferred successfully",
      data: {
        hospitalInventory: { hospitalInventoryRecord, OrgInventoryRecord },
        payment: paymentRecord,
      },
    });
  } catch (error) {
    console.error("=== TRANSACTION FAILED ===");
    console.error("Error:", error.message);
    console.error("Stack:", error.stack);

    return res.status(500).json({
      success: false,
      message: error.message || "Payment verification failed",
      error: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

// ✅ Export Functions
module.exports = {
  getRazorPay_keyID,
  create_order,
  verify_payment,
  verify_payment_hospital,
};
