const mongoose = require("mongoose");
const Payment = mongoose.model(
  "Payment",
  new mongoose.Schema({
    razorpay_order_id: String,
    razorpay_payment_id: String,
    amount: Number,
    bloodQuantity: Number,
    status: String,
  })
);

module.exports = Payment;
